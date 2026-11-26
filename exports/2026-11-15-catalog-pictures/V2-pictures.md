# V Solve Hub pictures: Version 2

As of 15 November 2026. Version 2 adds Construction Labour and Event & Media. Each construction role (Mason, Welding Worker and so on) is one service with one photo, because the customer hires the worker for a day. The tasks under each role need no picture.

This list replaces the photo part of the 10 November checklist. Please don't use that one any more.

| What | How many |
| --- | --- |
| Tile pictures (Event & Media) | 8 |
| Service photos: construction roles | 8 |
| Service photos: Event & Media | 109 |
| **Total** | **125** |

## How to use this file

- **Work top to bottom.** Tick a line off by changing `[ ]` to `[x]` once that picture is uploaded.
- **Use a different picture for every line.** Never reuse one picture for two lines.
- **Save each picture under the exact file name shown**, all lowercase with dashes. The app finds pictures by name, so a wrong name means a missing picture.
- **Not sure what to show?** Write a note next to the line and ask the owner. Don't guess.
- **When you finish,** send this file back to the owner.

## What the pictures look like

There are 2 kinds of picture in this file. Open the example links to see the style to match.

**Tile picture.** A 3D-rendered picture of **one object** on a plain off-white background. It is not a photo of people. Each line suggests the object.
- Examples: [Carpenter](https://media.vsolvehub.com/Images/Service%20Cover/Carpenter_tool_belt_rendering_202608271407.jpeg), [Switch & socket](https://media.vsolvehub.com/Images/Service%20Cover/Switch_and_socket_icon_generation_202608271407.jpeg), [Pet Grooming](https://media.vsolvehub.com/Images/Service%20Cover/Dog_grooming_icon_generation_202608271407.jpeg)
- Square JPEG, 1024 x 1024 px, under 200 KB. The file name ends in `.jpeg`.

**Service photo.** A realistic photo of the job being done, in an Indian home or workplace, with one clear subject.
- Examples: [Dog Grooming](https://media.vsolvehub.com/Images/Pet%20Services/Groomer_brushing_dog_coat_202608261908.jpeg), [Bridal & event makeup](https://media.vsolvehub.com/Images/Beautician/Makeup_artist_applying_bridal_ma%E2%80%A6_202608261908.jpeg), [Plumber by the day](https://media.vsolvehub.com/Images/PlumberServices/Man_repairing_leaking_tap_202608261714.jpeg)
- Square JPEG, 1024 x 1024 px, under 200 KB. The file name ends in `.jpeg`.

**Rules for every picture**

- No text, logos, watermarks or brand names inside the picture. Nothing blurry or stretched.
- Use only pictures you are allowed to use: your own, AI-generated, or free-licence sites such as Unsplash and Pexels. Never Google Images.

## Uploading

1. On your computer, make the folders shown in the file names. For example, `catalog-v2/event-media/photography/` holds the photos for that section.
2. In Cloudflare, open R2 and the bucket `vsolvehub` on the account that serves media.vsolvehub.com (account ID starts with `4d9ea6`). There is a second account with a bucket of the same name; do not use that one.
3. Open the `Images` folder in the bucket and upload your whole `catalog-v2` folder into it.
4. Open `Images/Service Cover` in the bucket and upload your whole `tiles-v2` folder into it. Tile pictures must go here, or the app shows them cropped like photos.
5. Check that a picture opens in the browser, for example:
   - https://media.vsolvehub.com/Images/Service%20Cover/tiles-v2/event-media/photography.jpeg
   - https://media.vsolvehub.com/Images/catalog-v2/construction-labour/mason.jpeg
6. If you don't have Cloudflare access, zip your folders and send them to the owner instead.

## Tile pictures

These are the squares customers tap first, so do them first.

### Event & Media (8)

- [x] **Photography** (show a DSLR camera with a lens): `tiles-v2/event-media/photography.jpeg`
- [x] **Videography** (show a video camera on a tripod): `tiles-v2/event-media/videography.jpeg`
- [x] **Video Editing** (show a laptop with a video timeline on screen): `tiles-v2/event-media/video-editing.jpeg`
- [x] **Photo Editing** (show a monitor with a photo being retouched): `tiles-v2/event-media/photo-editing.jpeg`
- [x] **Album & Printing** (show an open wedding photo album): `tiles-v2/event-media/album-printing.jpeg`
- [x] **DJ & Sound** (show a DJ console with two speakers): `tiles-v2/event-media/dj-sound.jpeg`
- [x] **Event Management** (show a clipboard with an event plan, balloons behind): `tiles-v2/event-media/event-management.jpeg`
- [x] **Entertainment Services** (show a microphone under a spotlight): `tiles-v2/event-media/entertainment-services.jpeg`

## Service photos

### Construction Labour › roles (8)

Show one worker doing the job on a real building site.

- [x] **Mason** (show a mason laying bricks on a building site): `catalog-v2/construction-labour/mason.jpeg`
- [x] **Shuttering Carpenter** (show a carpenter fixing wooden shuttering for a column): `catalog-v2/construction-labour/shuttering-carpenter.jpeg`
- [x] **Bar Bending (Steel Work)** (show a worker bending and tying steel rods): `catalog-v2/construction-labour/bar-bending-steel-work.jpeg`
- [x] **Concrete Labour** (show workers pouring concrete into a slab): `catalog-v2/construction-labour/concrete-labour.jpeg`
- [x] **Welding Worker** (show a welder with a mask welding a gate): `catalog-v2/construction-labour/welding-worker.jpeg`
- [x] **Fabrication Worker** (show a worker cutting a steel frame): `catalog-v2/construction-labour/fabrication-worker.jpeg`
- [x] **Scaffolding Worker** (show workers putting up scaffolding on a building): `catalog-v2/construction-labour/scaffolding-worker.jpeg`
- [x] **Road & Civil Worker** (show workers laying paver blocks): `catalog-v2/construction-labour/road-civil-worker.jpeg`

### Event & Media › Photography (17)

- [ ] **Event Photography**: `catalog-v2/event-media/photography/event-photography.jpeg`
- [ ] **Birthday Photography**: `catalog-v2/event-media/photography/birthday-photography.jpeg`
- [ ] **Wedding Photography**: `catalog-v2/event-media/photography/wedding-photography.jpeg`
- [ ] **Pre-Wedding Shoot**: `catalog-v2/event-media/photography/pre-wedding-shoot.jpeg`
- [ ] **Engagement Photography**: `catalog-v2/event-media/photography/engagement-photography.jpeg`
- [ ] **Reception Photography**: `catalog-v2/event-media/photography/reception-photography.jpeg`
- [ ] **Baby Shoot**: `catalog-v2/event-media/photography/baby-shoot.jpeg`
- [ ] **Kids Photography**: `catalog-v2/event-media/photography/kids-photography.jpeg`
- [ ] **Maternity Shoot**: `catalog-v2/event-media/photography/maternity-shoot.jpeg`
- [ ] **Family Shoot**: `catalog-v2/event-media/photography/family-shoot.jpeg`
- [ ] **Portfolio Shoot**: `catalog-v2/event-media/photography/portfolio-shoot.jpeg`
- [ ] **Product Photography**: `catalog-v2/event-media/photography/product-photography.jpeg`
- [ ] **Food Photography**: `catalog-v2/event-media/photography/food-photography.jpeg`
- [ ] **Real Estate Photography**: `catalog-v2/event-media/photography/real-estate-photography.jpeg`
- [ ] **Corporate Event Photography**: `catalog-v2/event-media/photography/corporate-event-photography.jpeg`
- [ ] **Candid Photography**: `catalog-v2/event-media/photography/candid-photography.jpeg`
- [ ] **Traditional Photography**: `catalog-v2/event-media/photography/traditional-photography.jpeg`

### Event & Media › Videography (15)

- [ ] **Event Videography**: `catalog-v2/event-media/videography/event-videography.jpeg`
- [ ] **Wedding Videography**: `catalog-v2/event-media/videography/wedding-videography.jpeg`
- [ ] **Pre-Wedding Video**: `catalog-v2/event-media/videography/pre-wedding-video.jpeg`
- [ ] **Engagement Video**: `catalog-v2/event-media/videography/engagement-video.jpeg`
- [ ] **Birthday Videography**: `catalog-v2/event-media/videography/birthday-videography.jpeg`
- [ ] **Drone Videography**: `catalog-v2/event-media/videography/drone-videography.jpeg`
- [ ] **Corporate Video Shoot**: `catalog-v2/event-media/videography/corporate-video-shoot.jpeg`
- [ ] **YouTube Video Shoot**: `catalog-v2/event-media/videography/youtube-video-shoot.jpeg`
- [ ] **Instagram Reels Shoot**: `catalog-v2/event-media/videography/instagram-reels-shoot.jpeg`
- [ ] **Short Film Shoot**: `catalog-v2/event-media/videography/short-film-shoot.jpeg`
- [ ] **Documentary Video**: `catalog-v2/event-media/videography/documentary-video.jpeg`
- [ ] **Promotional Video**: `catalog-v2/event-media/videography/promotional-video.jpeg`
- [ ] **Real Estate Video**: `catalog-v2/event-media/videography/real-estate-video.jpeg`
- [ ] **Product Video Shoot**: `catalog-v2/event-media/videography/product-video-shoot.jpeg`
- [ ] **Cinematic Video Shoot**: `catalog-v2/event-media/videography/cinematic-video-shoot.jpeg`

### Event & Media › Video Editing (10)

- [ ] **Basic Video Editing**: `catalog-v2/event-media/video-editing/basic-video-editing.jpeg`
- [ ] **Advanced Editing**: `catalog-v2/event-media/video-editing/advanced-editing.jpeg`
- [ ] **Wedding Highlight Video**: `catalog-v2/event-media/video-editing/wedding-highlight-video.jpeg`
- [ ] **Full Wedding Film Editing**: `catalog-v2/event-media/video-editing/full-wedding-film-editing.jpeg`
- [ ] **Reels Editing**: `catalog-v2/event-media/video-editing/reels-editing.jpeg`
- [ ] **YouTube Editing**: `catalog-v2/event-media/video-editing/youtube-editing.jpeg`
- [ ] **Color Grading**: `catalog-v2/event-media/video-editing/color-grading.jpeg`
- [ ] **Motion Graphics Editing**: `catalog-v2/event-media/video-editing/motion-graphics-editing.jpeg`
- [ ] **Subtitle Editing**: `catalog-v2/event-media/video-editing/subtitle-editing.jpeg`
- [ ] **Promo Video Editing**: `catalog-v2/event-media/video-editing/promo-video-editing.jpeg`

### Event & Media › Photo Editing (8)

- [ ] **Basic Photo Editing**: `catalog-v2/event-media/photo-editing/basic-photo-editing.jpeg`
- [ ] **Advanced Editing**: `catalog-v2/event-media/photo-editing/advanced-editing.jpeg`
- [ ] **Wedding Album Editing**: `catalog-v2/event-media/photo-editing/wedding-album-editing.jpeg`
- [ ] **Skin Retouching**: `catalog-v2/event-media/photo-editing/skin-retouching.jpeg`
- [ ] **Color Correction**: `catalog-v2/event-media/photo-editing/color-correction.jpeg`
- [ ] **Background Removal**: `catalog-v2/event-media/photo-editing/background-removal.jpeg`
- [ ] **Photo Enhancement**: `catalog-v2/event-media/photo-editing/photo-enhancement.jpeg`
- [ ] **AI Photo Restoration**: `catalog-v2/event-media/photo-editing/ai-photo-restoration.jpeg`

### Event & Media › Album & Printing (8)

- [ ] **Wedding Album Design**: `catalog-v2/event-media/album-printing/wedding-album-design.jpeg`
- [ ] **Birthday Album**: `catalog-v2/event-media/album-printing/birthday-album.jpeg`
- [ ] **Premium Album Printing**: `catalog-v2/event-media/album-printing/premium-album-printing.jpeg`
- [ ] **Digital Album**: `catalog-v2/event-media/album-printing/digital-album.jpeg`
- [ ] **Photo Printing**: `catalog-v2/event-media/album-printing/photo-printing.jpeg`
- [ ] **Frame Printing**: `catalog-v2/event-media/album-printing/frame-printing.jpeg`
- [ ] **Canvas Printing**: `catalog-v2/event-media/album-printing/canvas-printing.jpeg`
- [ ] **Photo Book Design**: `catalog-v2/event-media/album-printing/photo-book-design.jpeg`

### Event & Media › Decoration (15)

*This tile is already in the app. Only the service photos are needed.*

- [ ] **Site Visit & Consultation**: `catalog-v2/event-media/decoration/site-visit-consultation.jpeg`
- [ ] **Birthday Decoration**: `catalog-v2/event-media/decoration/birthday-decoration.jpeg`
- [ ] **Balloon Decoration**: `catalog-v2/event-media/decoration/balloon-decoration.jpeg`
- [ ] **Wedding Decoration**: `catalog-v2/event-media/decoration/wedding-decoration.jpeg`
- [ ] **Engagement Decoration**: `catalog-v2/event-media/decoration/engagement-decoration.jpeg`
- [ ] **Reception Decoration**: `catalog-v2/event-media/decoration/reception-decoration.jpeg`
- [ ] **Haldi Decoration**: `catalog-v2/event-media/decoration/haldi-decoration.jpeg`
- [ ] **Sangeet Decoration**: `catalog-v2/event-media/decoration/sangeet-decoration.jpeg`
- [ ] **Stage Decoration**: `catalog-v2/event-media/decoration/stage-decoration.jpeg`
- [ ] **Flower Decoration**: `catalog-v2/event-media/decoration/flower-decoration.jpeg`
- [ ] **Theme Decoration**: `catalog-v2/event-media/decoration/theme-decoration.jpeg`
- [ ] **Baby Shower Decoration**: `catalog-v2/event-media/decoration/baby-shower-decoration.jpeg`
- [ ] **Anniversary Decoration**: `catalog-v2/event-media/decoration/anniversary-decoration.jpeg`
- [ ] **Naming Ceremony Decoration**: `catalog-v2/event-media/decoration/naming-ceremony-decoration.jpeg`
- [ ] **Corporate Event Decoration**: `catalog-v2/event-media/decoration/corporate-event-decoration.jpeg`

### Event & Media › Catering (8)

*This tile is already in the app. Only the service photos are needed.*

- [ ] **Veg Catering**: `catalog-v2/event-media/catering/veg-catering.jpeg`
- [ ] **Non-Veg Catering**: `catalog-v2/event-media/catering/non-veg-catering.jpeg`
- [ ] **Buffet Setup**: `catalog-v2/event-media/catering/buffet-setup.jpeg`
- [ ] **Snacks Catering**: `catalog-v2/event-media/catering/snacks-catering.jpeg`
- [ ] **Full Meal Catering**: `catalog-v2/event-media/catering/full-meal-catering.jpeg`
- [ ] **Live Food Counter**: `catalog-v2/event-media/catering/live-food-counter.jpeg`
- [ ] **Outdoor Catering**: `catalog-v2/event-media/catering/outdoor-catering.jpeg`
- [ ] **Corporate Catering**: `catalog-v2/event-media/catering/corporate-catering.jpeg`

### Event & Media › DJ & Sound (10)

- [ ] **Site Visit & Consultation**: `catalog-v2/event-media/dj-sound/site-visit-consultation.jpeg`
- [ ] **DJ Setup**: `catalog-v2/event-media/dj-sound/dj-setup.jpeg`
- [ ] **Sound System Setup**: `catalog-v2/event-media/dj-sound/sound-system-setup.jpeg`
- [ ] **Stage Sound Setup**: `catalog-v2/event-media/dj-sound/stage-sound-setup.jpeg`
- [ ] **Lighting Setup**: `catalog-v2/event-media/dj-sound/lighting-setup.jpeg`
- [ ] **DJ Lights Setup**: `catalog-v2/event-media/dj-sound/dj-lights-setup.jpeg`
- [ ] **Smoke Machine Setup**: `catalog-v2/event-media/dj-sound/smoke-machine-setup.jpeg`
- [ ] **Live Band Setup**: `catalog-v2/event-media/dj-sound/live-band-setup.jpeg`
- [ ] **LED Wall Setup**: `catalog-v2/event-media/dj-sound/led-wall-setup.jpeg`
- [ ] **Laser Show Setup**: `catalog-v2/event-media/dj-sound/laser-show-setup.jpeg`

### Event & Media › Event Management (9)

- [ ] **Event Consultation**: `catalog-v2/event-media/event-management/event-consultation.jpeg`
- [ ] **Full Event Management**: `catalog-v2/event-media/event-management/full-event-management.jpeg`
- [ ] **Wedding Planning**: `catalog-v2/event-media/event-management/wedding-planning.jpeg`
- [ ] **Birthday Planning**: `catalog-v2/event-media/event-management/birthday-planning.jpeg`
- [ ] **Corporate Event Management**: `catalog-v2/event-media/event-management/corporate-event-management.jpeg`
- [ ] **Event Coordination**: `catalog-v2/event-media/event-management/event-coordination.jpeg`
- [ ] **Anchor / Host**: `catalog-v2/event-media/event-management/anchor-host.jpeg`
- [ ] **Celebrity Management**: `catalog-v2/event-media/event-management/celebrity-management.jpeg`
- [ ] **Destination Wedding Planning**: `catalog-v2/event-media/event-management/destination-wedding-planning.jpeg`

### Event & Media › Entertainment Services (9)

- [ ] **Magician Show**: `catalog-v2/event-media/entertainment-services/magician-show.jpeg`
- [ ] **Dance Performance**: `catalog-v2/event-media/entertainment-services/dance-performance.jpeg`
- [ ] **Live Singer**: `catalog-v2/event-media/entertainment-services/live-singer.jpeg`
- [ ] **Anchor / MC**: `catalog-v2/event-media/entertainment-services/anchor-mc.jpeg`
- [ ] **Kids Entertainment**: `catalog-v2/event-media/entertainment-services/kids-entertainment.jpeg`
- [ ] **Fireworks Show**: `catalog-v2/event-media/entertainment-services/fireworks-show.jpeg`
- [ ] **Game Organizer**: `catalog-v2/event-media/entertainment-services/game-organizer.jpeg`
- [ ] **Mimicry Show**: `catalog-v2/event-media/entertainment-services/mimicry-show.jpeg`
- [ ] **Stand-up Comedy**: `catalog-v2/event-media/entertainment-services/stand-up-comedy.jpeg`
