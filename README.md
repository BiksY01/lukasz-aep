# lukasz.aep

my personal site. built it to feel more like a little OS than a webpage, frutiger aero /
wii menu vibes, glass on everything.

live: https://lukasz-aep.pages.dev

## stuff it does
- a spinning glass globe and aero panels, all pure css (no faked images, actual gloss)
- a radio that actually works. it's a css device with real tracks
- a live widget showing a game server's players and health as it happens
- a bubble-pop game with a high-score board that sticks around
- a little "who's online" counter
- auto lite-mode: weak device or connection, it drops the heavy effects so it doesn't chug
- parallax, cursor tilt, globe spins as you scroll, all on the gpu so old machines survive

## how it's built
plain html/css/js, no framework. the 3d and glass is all css. kept the animation on
transform/opacity so it holds 60fps even on a potato.

backend, deploy and config aren't in here on purpose.
