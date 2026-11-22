# V Solve Hub pictures: Version 1

As of 15 November 2026. Version 1 adds new services to the Technician and Beautician categories already in the app. No new tiles are needed, only one photo per service.

This list replaces the photo part of the 10 November checklist. Please don't use that one any more.

| What | How many |
| --- | --- |
| Service photos | 22 |
| **Total** | **22** |

## How to use this file

- **Work top to bottom.** Tick a line off by changing `[ ]` to `[x]` once that picture is uploaded.
- **Use a different picture for every line.** Never reuse one picture for two lines.
- **Save each picture under the exact file name shown**, all lowercase with dashes. The app finds pictures by name, so a wrong name means a missing picture.
- **Not sure what to show?** Write a note next to the line and ask the owner. Don't guess.
- **When you finish,** send this file back to the owner.

## What the pictures look like

Every picture in this file is a service photo. Open the example links to see the style to match.

**Service photo.** A realistic photo of the job being done, in an Indian home or workplace, with one clear subject.
- Examples: [Dog Grooming](https://media.vsolvehub.com/Images/Pet%20Services/Groomer_brushing_dog_coat_202608261908.jpeg), [Bridal & event makeup](https://media.vsolvehub.com/Images/Beautician/Makeup_artist_applying_bridal_ma%E2%80%A6_202608261908.jpeg), [Plumber by the day](https://media.vsolvehub.com/Images/PlumberServices/Man_repairing_leaking_tap_202608261714.jpeg)
- Square JPEG, 1024 x 1024 px, under 200 KB. The file name ends in `.jpeg`.

**Rules for every picture**

- No text, logos, watermarks or brand names inside the picture. Nothing blurry or stretched.
- Use only pictures you are allowed to use: your own, AI-generated, or free-licence sites such as Unsplash and Pexels. Never Google Images.

## Uploading

1. On your computer, make the folders shown in the file names. For example, `catalog-v2/technician/electrician/` holds the photos for that section.
2. In Cloudflare, open R2 and the bucket `vsolvehub` on the account that serves media.vsolvehub.com (account ID starts with `4d9ea6`). There is a second account with a bucket of the same name; do not use that one.
3. Open the `Images` folder in the bucket and upload your whole `catalog-v2` folder into it.
4. Check that a picture opens in the browser, for example:
   - https://media.vsolvehub.com/Images/catalog-v2/technician/electrician/new-house-wiring.jpeg
5. If you don't have Cloudflare access, zip your folders and send them to the owner instead.

## Service photos

### Technician › Electrician (5)

- [x] **New House Wiring**: `catalog-v2/technician/electrician/new-house-wiring.jpeg`
- [x] **Concealed Wiring**: `catalog-v2/technician/electrician/concealed-wiring.jpeg`
- [x] **Open Wiring**: `catalog-v2/technician/electrician/open-wiring.jpeg`
- [x] **Conduit Pipe Laying**: `catalog-v2/technician/electrician/conduit-pipe-laying.jpeg`
- [x] **Cable Pulling**: `catalog-v2/technician/electrician/cable-pulling.jpeg`

### Technician › Plumbing (6)

- [x] **New Pipeline Installation**: `catalog-v2/technician/plumbing/new-pipeline-installation.jpeg`
- [x] **Old Pipe Replacement**: `catalog-v2/technician/plumbing/old-pipe-replacement.jpeg`
- [x] **Pipe Extension Work**: `catalog-v2/technician/plumbing/pipe-extension-work.jpeg`
- [x] **Underground Pipeline Work**: `catalog-v2/technician/plumbing/underground-pipeline-work.jpeg`
- [x] **Drain Line Installation**: `catalog-v2/technician/plumbing/drain-line-installation.jpeg`
- [x] **Sewer Line Work**: `catalog-v2/technician/plumbing/sewer-line-work.jpeg`

### Technician › Carpenter (3)

*Cupboard / Hinge Repair is already in the app but has no photo yet.*

- [x] **Wood Polishing**: `catalog-v2/technician/carpenter/wood-polishing.jpeg`
- [x] **Laminate Fixing**: `catalog-v2/technician/carpenter/laminate-fixing.jpeg`
- [x] **Cupboard / Hinge Repair**: `catalog-v2/technician/carpenter/cupboard-hinge-repair.jpeg`

### Technician › Internet & WiFi Technician (1)

- [x] **LAN Cable Wiring**: `catalog-v2/technician/internet-wifi-technician/lan-cable-wiring.jpeg`

### Technician › CCTV & Security Technician (2)

- [x] **Full CCTV Setup**: `catalog-v2/technician/cctv-security-technician/full-cctv-setup.jpeg`
- [x] **CCTV Wiring**: `catalog-v2/technician/cctv-security-technician/cctv-wiring.jpeg`

### Technician › Home Automation & Sound (1)

- [x] **Smart Home Setup**: `catalog-v2/technician/home-automation-sound/smart-home-setup.jpeg`

### Beautician › Bridal Packages (4)

- [x] **Pre-Bridal Package**: `catalog-v2/beautician/bridal-packages/pre-bridal-package.jpeg`
- [x] **Bridal Full Package**: `catalog-v2/beautician/bridal-packages/bridal-full-package.jpeg`
- [x] **Engagement Package**: `catalog-v2/beautician/bridal-packages/engagement-package.jpeg`
- [x] **Bridesmaid Makeup**: `catalog-v2/beautician/bridal-packages/bridesmaid-makeup.jpeg`
