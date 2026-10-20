# Virtual DualShock 4 prototype: findings

Input for the virtual DS4 spec. The prototype turned each phone slot into a ViGEmBus DualShock 4
(extended report: touchpad, gyroscope, accelerometer) and sent the game's rumble and lightbar
back to the phone. Tested on Windows with Steam, Counter-Strike and Overwatch, October 2026.

## What works

- One virtual DS4 per phone; Windows, Steam and games see a real controller. Buttons, sticks,
  analog triggers, touchpad (two touches and click) and motion all reach Steam.
- Counter-Strike plays well. Overwatch plays well **with Steam Input on**; with Steam Input off
  the game reads the pad natively and responds only every few seconds (a real controller works
  there). To check in the spec: native (non-Steam) behavior, and telling the player to enable
  Steam Input when needed.
- Gyro is precise and smooth. Units: 16 raw per °/s (gyro), 8192 per g (accelerometer); the report
  timestamp counts 5.33 µs ticks.

## Motion frame

- The page reports motion in the screen frame (x right, y up the screen, z toward the player).
  Measured on Android/Chrome: `rotationRate.alpha/beta/gamma` are around the device's x/y/z axes,
  and the screen rotation had to be applied the other way round (fixed in the page polish spec).
- With that frame, a phone held sideways and upright toward the player maps **one to one** to a DS4
  lying flat (DS4 x right, y out of the top face, z toward the player). Verified in Steam: turning
  the phone like a door moves the camera left/right; with the phone lying flat, Steam's player or
  world gyro space keeps that behavior, local space turns around the phone's own up axis.
- Possible option later: a "held flat" grip that maps a phone lying flat to the DS4 lying flat.

## Report rate

- The prototype resends every pad's report at 250 Hz and increments the 6-bit report counter
  (bits 2–7 of the special byte) like a real DS4. Turning either off made no clear difference;
  keep both, as they match the hardware.
- Sticks and touchpad feel slightly "laggy" in Steam; a real DualSense feels the same there, so it
  is Steam's processing.

## Rumble

- Every rumble the driver reports reaches the phone within 1–2 ms.
- What arrives is uneven: mostly 50 ms pulses at a fixed strength (large 76, small 51) when a
  trigger is pressed **and released** (Steam's trigger haptics), and rarely the game's own rumble;
  holding a machine gun produced no sustained rumble, while a real DS4 rumbles continuously.
  To investigate: Steam's rumble setting for the virtual pad, where the game sends its rumble, and
  whether Steam treats the virtual DS4 differently from a real one.
- The page treats game rumble as experimental (menu: game and buttons, game only, buttons only,
  off), keeps rumbling 150 ms after a stop (motor inertia) and never lets button taps cut it.

## Touchpad click

- Steam tells left and right clicks apart by the finger position, as on a real DS4; one click bit
  is enough. With the click held and no finger on the touchpad, Steam can fire the touchpad click's
  own binding (often View: the game's scoreboard); the page now lets go of the click when the
  finger leaves the touchpad.
