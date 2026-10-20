//! The secure server: port fallback, a real TLS WebSocket and the page served over HTTPS.

mod common;

use std::sync::Arc;

use common::{RecordingSink, device};
use futures_util::{SinkExt, StreamExt};
use ninjoy_session::protocol::{HostMessage, PageMessage, decode_host, encode_page};
use ninjoy_session::{Session, SessionConfig};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, SignatureScheme};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_tungstenite::tungstenite::Message;

/// Trusts any certificate (the host's is self-signed) but still checks the handshake signatures.
#[derive(Debug)]
struct AcceptSelfSigned(Arc<rustls::crypto::CryptoProvider>);

impl ServerCertVerifier for AcceptSelfSigned {
    fn verify_server_cert(
        &self,
        _: &CertificateDer<'_>,
        _: &[CertificateDer<'_>],
        _: &ServerName<'_>,
        _: &[u8],
        _: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

async fn tls(port: u16) -> tokio_rustls::client::TlsStream<TcpStream> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .unwrap()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptSelfSigned(provider)))
        .with_no_client_auth();
    let tcp = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    TlsConnector::from(Arc::new(config))
        .connect(ServerName::try_from("ninjoy.local").unwrap(), tcp)
        .await
        .expect("TLS handshake")
}

#[tokio::test]
async fn https_falls_back_to_a_free_port_and_carries_the_session() {
    let blocker = std::net::TcpListener::bind("0.0.0.0:0").unwrap();
    let taken = blocker.local_addr().unwrap().port();
    let dir = std::env::temp_dir().join(format!("ninjoy-https-{}", std::process::id()));
    let sink = Arc::new(RecordingSink::default());
    let session = Session::start(
        SessionConfig {
            plain_ports: vec![taken, 0],
            secure_ports: vec![taken, 0],
            data_dir: Some(dir.clone()),
            announce: false,
            ..SessionConfig::default()
        },
        sink,
    )
    .await
    .expect("starts on the fallback ports");
    let a = session.addresses().clone();
    assert_ne!(a.plain_port, taken);
    let secure = a.secure_port.expect("HTTPS is running");
    assert_ne!(secure, taken);
    assert!(
        dir.join("cert.pem").exists(),
        "the certificate is kept for later runs"
    );

    // the secure address serves the controller itself (no certificate explanation)
    let mut stream = tls(secure).await;
    stream
        .write_all(b"GET /2 HTTP/1.1\r\nHost: ninjoy.local\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut page = String::new();
    let _ = stream.read_to_string(&mut page).await;
    assert!(page.starts_with("HTTP/1.1 200"), "{page}");
    assert!(page.contains("assets/main"), "controller page over HTTPS");

    // the plain address explains the warning and knows where HTTPS listens
    let mut plain = TcpStream::connect(("127.0.0.1", a.plain_port))
        .await
        .unwrap();
    plain
        .write_all(
            b"GET /2 HTTP/1.1
Host: x
Connection: close

",
        )
        .await
        .unwrap();
    let mut explanation = String::new();
    let _ = plain.read_to_string(&mut explanation).await;
    assert!(
        explanation.contains(&format!("name=\"ninjoy-secure-port\" content=\"{secure}\"")),
        "{explanation}"
    );

    // a secure WebSocket joins a slot
    let (mut ws, _) =
        tokio_tungstenite::client_async(format!("wss://127.0.0.1:{secure}/ws"), tls(secure).await)
            .await
            .expect("wss");
    let mut buf = Vec::new();
    encode_page(
        &PageMessage::Hello {
            version: 1,
            slot: 0,
            device: device(1),
        },
        &mut buf,
    );
    ws.send(Message::Binary(buf.into())).await.unwrap();
    let reply = loop {
        if let Some(Ok(Message::Binary(bytes))) = ws.next().await
            && let Some(message) = decode_host(&bytes).unwrap()
            && !matches!(message, HostMessage::Ping { .. })
        {
            break message;
        }
    };
    assert_eq!(
        reply,
        HostMessage::Welcome {
            version: 1,
            slot: 1
        }
    );
    drop(blocker);
    session.shutdown().await;
    let _ = std::fs::remove_dir_all(dir);
}
