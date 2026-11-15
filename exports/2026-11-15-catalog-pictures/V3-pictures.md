# V Solve Hub pictures: Version 3

As of 15 November 2026. Version 3 adds the new Man Power & Support Staff category and the remaining services in Construction, Technician, Home and Pet.

This list replaces the photo part of the 10 November checklist. Please don't use that one any more.

| What | How many |
| --- | --- |
| Category icon (Man Power & Support Staff) | 1 |
| Tile pictures | 30 |
| Service photos | 134 |
| **Total** | **165** |

## How to use this file

- **Work top to bottom.** Tick a line off by changing `[ ]` to `[x]` once that picture is uploaded.
- **Use a different picture for every line.** Never reuse one picture for two lines.
- **Save each picture under the exact file name shown**, all lowercase with dashes. The app finds pictures by name, so a wrong name means a missing picture.
- **Not sure what to show?** Write a note next to the line and ask the owner. Don't guess.
- **When you finish,** send this file back to the owner.

## What the pictures look like

There are 3 kinds of picture in this file. Open the example links to see the style to match.

**Category icon.** A 3D icon in the same style as the other category icons.
- Example: [Construction](https://media.vsolvehub.com/Images/Icons/download%20%283%29.png)
- PNG with a transparent background, about 500 x 500 px, under 200 KB.

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

1. On your computer, make the folders shown in the file names. For example, `catalog-v2/construction-labour/architect/` holds the photos for that section.
2. In Cloudflare, open R2 and the bucket `vsolvehub` on the account that serves media.vsolvehub.com (account ID starts with `4d9ea6`). There is a second account with a bucket of the same name; do not use that one.
3. Open the `Images` folder in the bucket and upload your whole `catalog-v2` folder into it.
4. Open `Images/Service Cover` in the bucket and upload your whole `tiles-v2` folder into it. Tile pictures must go here, or the app shows them cropped like photos.
5. Check that a picture opens in the browser, for example:
   - https://media.vsolvehub.com/Images/catalog-v2/categories/manpower.png
   - https://media.vsolvehub.com/Images/Service%20Cover/tiles-v2/construction-labour/architect.jpeg
6. If you don't have Cloudflare access, zip your folders and send them to the owner instead.

**Do last:** the four tiles in the last section (Maid Services, Elder Care, Domestic Staff, Event & Catering Staff) overlap with each other or with services already in the app. The owner may merge them, so leave them until everything else is done.

## Category icon

- [ ] **Man Power & Support Staff** (show a group of workers, or a worker's ID card with a hard hat): `catalog-v2/categories/manpower.png`

## Tile pictures

These are the squares customers tap first, so do them first.

### Construction Labour (8)

- [ ] **Architect** (show rolled house blueprints with a ruler): `tiles-v2/construction-labour/architect.jpeg`
- [ ] **Civil Engineer** (show a hard hat resting on building drawings): `tiles-v2/construction-labour/civil-engineer.jpeg`
- [ ] **Quantity Surveyor** (show a measuring tape, calculator and cost sheet): `tiles-v2/construction-labour/quantity-surveyor.jpeg`
- [ ] **Site Supervisor** (show a hard hat with a clipboard): `tiles-v2/construction-labour/site-supervisor.jpeg`
- [ ] **Project Manager** (show a project schedule board with a hard hat): `tiles-v2/construction-labour/project-manager.jpeg`
- [ ] **False Ceiling Worker** (show a gypsum false-ceiling panel with recessed lights): `tiles-v2/construction-labour/false-ceiling-worker.jpeg`
- [ ] **Glass & Aluminium Worker** (show an aluminium window frame with glass): `tiles-v2/construction-labour/glass-aluminium-worker.jpeg`
- [ ] **UPVC Worker** (show a white UPVC window): `tiles-v2/construction-labour/upvc-worker.jpeg`

### Technician (3)

- [ ] **Watch Repair & Services** (show an open wristwatch with tiny repair tools): `tiles-v2/technician/watch-repair-services.jpeg`
- [ ] **Solar Technician** (show a rooftop solar panel): `tiles-v2/technician/solar-technician.jpeg`
- [ ] **Lift Technician** (show lift doors with call buttons): `tiles-v2/technician/lift-technician.jpeg`

### Home Services (3)

- [ ] **Borewell Services** (show a borewell pipe with a submersible pump): `tiles-v2/home-services/borewell-services.jpeg`
- [ ] **Home Shifting** (show a moving truck with packed boxes): `tiles-v2/home-services/home-shifting.jpeg`
- [ ] **Storage Services** (show a storage unit with stacked boxes): `tiles-v2/home-services/storage-services.jpeg`

### Pet Services (5)

- [ ] **Pet Boarding** (show a dog bed inside a clean kennel): `tiles-v2/pet-services/pet-boarding.jpeg`
- [ ] **Pet Taxi** (show a small car with a pet carrier): `tiles-v2/pet-services/pet-taxi.jpeg`
- [ ] **Pet Adoption** (show a puppy wearing a heart-shaped tag): `tiles-v2/pet-services/pet-adoption.jpeg`
- [ ] **Pet Shop** (show a bag of pet food with toys): `tiles-v2/pet-services/pet-shop.jpeg`
- [ ] **Pet Insurance** (show a paw print on a shield): `tiles-v2/pet-services/pet-insurance.jpeg`

### Man Power & Support Staff (7)

- [ ] **Cleaning & Maintenance Staff** (show a cleaning cart with mop and bucket): `tiles-v2/manpower/cleaning-maintenance-staff.jpeg`
- [ ] **Logistics & Handling** (show stacked cartons on a hand trolley): `tiles-v2/manpower/logistics-handling.jpeg`
- [ ] **Drivers & Transport Staff** (show a steering wheel with a car key): `tiles-v2/manpower/drivers-transport-staff.jpeg`
- [ ] **Office Support Staff** (show an office desk with files and a phone): `tiles-v2/manpower/office-support-staff.jpeg`
- [ ] **Security Staff** (show a security guard cap with a whistle): `tiles-v2/manpower/security-staff.jpeg`
- [ ] **Retail Support Staff** (show a shopping basket on a store counter): `tiles-v2/manpower/retail-support-staff.jpeg`
- [ ] **Industrial Support Staff** (show a hard hat and gloves beside factory gears): `tiles-v2/manpower/industrial-support-staff.jpeg`

## Service photos

### Construction Labour › Interior Designer (7)

*This goes into the Interior fit-outs tile already in the app, so it needs no tile picture.*

- [ ] **Home Interior Design**: `catalog-v2/construction-labour/interior-designer/home-interior-design.jpeg`
- [ ] **Office Interior Design**: `catalog-v2/construction-labour/interior-designer/office-interior-design.jpeg`
- [ ] **Modular Kitchen Design**: `catalog-v2/construction-labour/interior-designer/modular-kitchen-design.jpeg`
- [ ] **Wardrobe Design**: `catalog-v2/construction-labour/interior-designer/wardrobe-design.jpeg`
- [ ] **False Ceiling Design**: `catalog-v2/construction-labour/interior-designer/false-ceiling-design.jpeg`
- [ ] **3D Interior Design**: `catalog-v2/construction-labour/interior-designer/3d-interior-design.jpeg`
- [ ] **Interior Consultation**: `catalog-v2/construction-labour/interior-designer/interior-consultation.jpeg`

### Construction Labour › Architect (5)

- [ ] **House Plan**: `catalog-v2/construction-labour/architect/house-plan.jpeg`
- [ ] **Building Plan Approval**: `catalog-v2/construction-labour/architect/building-plan-approval.jpeg`
- [ ] **2D Floor Plan**: `catalog-v2/construction-labour/architect/2d-floor-plan.jpeg`
- [ ] **3D Elevation**: `catalog-v2/construction-labour/architect/3d-elevation.jpeg`
- [ ] **Structural Drawing**: `catalog-v2/construction-labour/architect/structural-drawing.jpeg`

### Construction Labour › Civil Engineer (3)

- [ ] **Site Inspection**: `catalog-v2/construction-labour/civil-engineer/site-inspection.jpeg`
- [ ] **Estimation & Costing**: `catalog-v2/construction-labour/civil-engineer/estimation-costing.jpeg`
- [ ] **Project Planning**: `catalog-v2/construction-labour/civil-engineer/project-planning.jpeg`

### Construction Labour › Quantity Surveyor (3)

- [ ] **BOQ Preparation**: `catalog-v2/construction-labour/quantity-surveyor/boq-preparation.jpeg`
- [ ] **Quantity Estimation**: `catalog-v2/construction-labour/quantity-surveyor/quantity-estimation.jpeg`
- [ ] **Billing Support**: `catalog-v2/construction-labour/quantity-surveyor/billing-support.jpeg`

### Construction Labour › Site Supervisor (1)

- [ ] **Daily Site Supervision**: `catalog-v2/construction-labour/site-supervisor/daily-site-supervision.jpeg`

### Construction Labour › Project Manager (1)

- [ ] **Turnkey Project Management**: `catalog-v2/construction-labour/project-manager/turnkey-project-management.jpeg`

### Construction Labour › False Ceiling Worker (3)

- [ ] **Gypsum Ceiling**: `catalog-v2/construction-labour/false-ceiling-worker/gypsum-ceiling.jpeg`
- [ ] **POP Ceiling**: `catalog-v2/construction-labour/false-ceiling-worker/pop-ceiling.jpeg`
- [ ] **PVC Ceiling**: `catalog-v2/construction-labour/false-ceiling-worker/pvc-ceiling.jpeg`

### Construction Labour › Glass & Aluminium Worker (3)

- [ ] **Toughened Glass**: `catalog-v2/construction-labour/glass-aluminium-worker/toughened-glass.jpeg`
- [ ] **Aluminium Partition**: `catalog-v2/construction-labour/glass-aluminium-worker/aluminium-partition.jpeg`
- [ ] **ACP Cladding**: `catalog-v2/construction-labour/glass-aluminium-worker/acp-cladding.jpeg`

### Construction Labour › UPVC Worker (2)

- [ ] **UPVC Doors**: `catalog-v2/construction-labour/upvc-worker/upvc-doors.jpeg`
- [ ] **UPVC Windows**: `catalog-v2/construction-labour/upvc-worker/upvc-windows.jpeg`

### Construction Labour › Flooring Worker (3)

*This goes into the Tiling & flooring tile already in the app, so it needs no tile picture.*

- [ ] **Wooden Flooring**: `catalog-v2/construction-labour/flooring-worker/wooden-flooring.jpeg`
- [ ] **Vinyl Flooring**: `catalog-v2/construction-labour/flooring-worker/vinyl-flooring.jpeg`
- [ ] **Epoxy Flooring**: `catalog-v2/construction-labour/flooring-worker/epoxy-flooring.jpeg`

### Technician › Solar Technician (3)

- [ ] **Solar Panel Installation**: `catalog-v2/technician/solar-technician/solar-panel-installation.jpeg`
- [ ] **Solar Maintenance**: `catalog-v2/technician/solar-technician/solar-maintenance.jpeg`
- [ ] **Solar Cleaning**: `catalog-v2/technician/solar-technician/solar-cleaning.jpeg`

### Technician › Lift Technician (2)

- [ ] **Elevator Installation**: `catalog-v2/technician/lift-technician/elevator-installation.jpeg`
- [ ] **Lift Repair**: `catalog-v2/technician/lift-technician/lift-repair.jpeg`

### Technician › Watch Repair & Services (13)

- [ ] **Battery Replacement**: `catalog-v2/technician/watch-repair-services/battery-replacement.jpeg`
- [ ] **Strap Replacement**: `catalog-v2/technician/watch-repair-services/strap-replacement.jpeg`
- [ ] **Dial Repair**: `catalog-v2/technician/watch-repair-services/dial-repair.jpeg`
- [ ] **Glass Replacement**: `catalog-v2/technician/watch-repair-services/glass-replacement.jpeg`
- [ ] **Crown Repair**: `catalog-v2/technician/watch-repair-services/crown-repair.jpeg`
- [ ] **Complete Watch Servicing**: `catalog-v2/technician/watch-repair-services/complete-watch-servicing.jpeg`
- [ ] **Smart Watch Repair**: `catalog-v2/technician/watch-repair-services/smart-watch-repair.jpeg`
- [ ] **Smart Watch Display Replacement**: `catalog-v2/technician/watch-repair-services/smart-watch-display-replacement.jpeg`
- [ ] **Smart Watch Battery Replacement**: `catalog-v2/technician/watch-repair-services/smart-watch-battery-replacement.jpeg`
- [ ] **Button Repair**: `catalog-v2/technician/watch-repair-services/button-repair.jpeg`
- [ ] **Waterproof Testing**: `catalog-v2/technician/watch-repair-services/waterproof-testing.jpeg`
- [ ] **Watch Polishing**: `catalog-v2/technician/watch-repair-services/watch-polishing.jpeg`
- [ ] **Watch Cleaning**: `catalog-v2/technician/watch-repair-services/watch-cleaning.jpeg`

### Man Power & Support Staff › Cleaning & Maintenance Staff (6)

- [ ] **Housekeeping Staff**: `catalog-v2/manpower/cleaning-maintenance-staff/housekeeping-staff.jpeg`
- [ ] **Office Cleaning Staff**: `catalog-v2/manpower/cleaning-maintenance-staff/office-cleaning-staff.jpeg`
- [ ] **Janitors**: `catalog-v2/manpower/cleaning-maintenance-staff/janitors.jpeg`
- [ ] **Deep Cleaning Teams**: `catalog-v2/manpower/cleaning-maintenance-staff/deep-cleaning-teams.jpeg`
- [ ] **Maintenance Workers**: `catalog-v2/manpower/cleaning-maintenance-staff/maintenance-workers.jpeg`
- [ ] **Pest Control Helpers**: `catalog-v2/manpower/cleaning-maintenance-staff/pest-control-helpers.jpeg`

### Man Power & Support Staff › Logistics & Handling (6)

- [ ] **Loading Staff**: `catalog-v2/manpower/logistics-handling/loading-staff.jpeg`
- [ ] **Unloading Staff**: `catalog-v2/manpower/logistics-handling/unloading-staff.jpeg`
- [ ] **Packers & Movers Staff**: `catalog-v2/manpower/logistics-handling/packers-movers-staff.jpeg`
- [ ] **Delivery Helpers**: `catalog-v2/manpower/logistics-handling/delivery-helpers.jpeg`
- [ ] **Warehouse Helpers**: `catalog-v2/manpower/logistics-handling/warehouse-helpers.jpeg`
- [ ] **Material Handling Staff**: `catalog-v2/manpower/logistics-handling/material-handling-staff.jpeg`

### Man Power & Support Staff › Drivers & Transport Staff (6)

- [ ] **Car Drivers**: `catalog-v2/manpower/drivers-transport-staff/car-drivers.jpeg`
- [ ] **Truck Drivers**: `catalog-v2/manpower/drivers-transport-staff/truck-drivers.jpeg`
- [ ] **Tempo Drivers**: `catalog-v2/manpower/drivers-transport-staff/tempo-drivers.jpeg`
- [ ] **Bus Drivers**: `catalog-v2/manpower/drivers-transport-staff/bus-drivers.jpeg`
- [ ] **Temporary Drivers**: `catalog-v2/manpower/drivers-transport-staff/temporary-drivers.jpeg`
- [ ] **Permanent Drivers**: `catalog-v2/manpower/drivers-transport-staff/permanent-drivers.jpeg`

### Man Power & Support Staff › Office Support Staff (6)

- [ ] **Office Boys**: `catalog-v2/manpower/office-support-staff/office-boys.jpeg`
- [ ] **Office Assistants**: `catalog-v2/manpower/office-support-staff/office-assistants.jpeg`
- [ ] **Data Entry Operators**: `catalog-v2/manpower/office-support-staff/data-entry-operators.jpeg`
- [ ] **Receptionists**: `catalog-v2/manpower/office-support-staff/receptionists.jpeg`
- [ ] **File Management Staff**: `catalog-v2/manpower/office-support-staff/file-management-staff.jpeg`
- [ ] **Front Office Staff**: `catalog-v2/manpower/office-support-staff/front-office-staff.jpeg`

### Man Power & Support Staff › Security Staff (5)

- [ ] **Security Guards**: `catalog-v2/manpower/security-staff/security-guards.jpeg`
- [ ] **Bouncers**: `catalog-v2/manpower/security-staff/bouncers.jpeg`
- [ ] **Watchmen**: `catalog-v2/manpower/security-staff/watchmen.jpeg`
- [ ] **Gate Security Staff**: `catalog-v2/manpower/security-staff/gate-security-staff.jpeg`
- [ ] **Event Security Staff**: `catalog-v2/manpower/security-staff/event-security-staff.jpeg`

### Man Power & Support Staff › Retail Support Staff (4)

- [ ] **Sales Boys**: `catalog-v2/manpower/retail-support-staff/sales-boys.jpeg`
- [ ] **Sales Girls**: `catalog-v2/manpower/retail-support-staff/sales-girls.jpeg`
- [ ] **Store Helpers**: `catalog-v2/manpower/retail-support-staff/store-helpers.jpeg`
- [ ] **Cash Counter Assistants**: `catalog-v2/manpower/retail-support-staff/cash-counter-assistants.jpeg`

### Man Power & Support Staff › Industrial Support Staff (4)

- [ ] **Factory Helpers**: `catalog-v2/manpower/industrial-support-staff/factory-helpers.jpeg`
- [ ] **Packing Staff**: `catalog-v2/manpower/industrial-support-staff/packing-staff.jpeg`
- [ ] **Assembly Line Helpers**: `catalog-v2/manpower/industrial-support-staff/assembly-line-helpers.jpeg`
- [ ] **Production Helpers**: `catalog-v2/manpower/industrial-support-staff/production-helpers.jpeg`

### Home Services › Borewell Services (3)

- [ ] **Borewell Cleaning**: `catalog-v2/home-services/borewell-services/borewell-cleaning.jpeg`
- [ ] **Borewell Repair**: `catalog-v2/home-services/borewell-services/borewell-repair.jpeg`
- [ ] **Borewell Motor Installation**: `catalog-v2/home-services/borewell-services/borewell-motor-installation.jpeg`

### Home Services › Home Shifting (6)

- [ ] **House Shifting**: `catalog-v2/home-services/home-shifting/house-shifting.jpeg`
- [ ] **Packing Service**: `catalog-v2/home-services/home-shifting/packing-service.jpeg`
- [ ] **Unpacking Service**: `catalog-v2/home-services/home-shifting/unpacking-service.jpeg`
- [ ] **Loading & Unloading**: `catalog-v2/home-services/home-shifting/loading-unloading.jpeg`
- [ ] **Furniture Shifting**: `catalog-v2/home-services/home-shifting/furniture-shifting.jpeg`
- [ ] **Office Shifting**: `catalog-v2/home-services/home-shifting/office-shifting.jpeg`

### Home Services › Storage Services (3)

- [ ] **Household Storage**: `catalog-v2/home-services/storage-services/household-storage.jpeg`
- [ ] **Office Storage**: `catalog-v2/home-services/storage-services/office-storage.jpeg`
- [ ] **Warehouse Storage**: `catalog-v2/home-services/storage-services/warehouse-storage.jpeg`

### Home Services › Home Maintenance (1)

*This tile is already in the app. Only the service photo is needed.*

- [ ] **Annual Home Maintenance Contract (AMC)**: `catalog-v2/home-services/home-maintenance/annual-home-maintenance-contract-amc.jpeg`

### Pet Services › Pet Boarding (3)

- [ ] **Dog Boarding**: `catalog-v2/pet-services/pet-boarding/dog-boarding.jpeg`
- [ ] **Cat Boarding**: `catalog-v2/pet-services/pet-boarding/cat-boarding.jpeg`
- [ ] **Day Care**: `catalog-v2/pet-services/pet-boarding/day-care.jpeg`

### Pet Services › Pet Taxi (1)

- [ ] **Pet Pickup & Drop**: `catalog-v2/pet-services/pet-taxi/pet-pickup-drop.jpeg`

### Pet Services › Pet Adoption (2)

- [ ] **Dog Adoption**: `catalog-v2/pet-services/pet-adoption/dog-adoption.jpeg`
- [ ] **Cat Adoption**: `catalog-v2/pet-services/pet-adoption/cat-adoption.jpeg`

### Pet Services › Pet Shop (4)

- [ ] **Pet Food**: `catalog-v2/pet-services/pet-shop/pet-food.jpeg`
- [ ] **Pet Accessories**: `catalog-v2/pet-services/pet-shop/pet-accessories.jpeg`
- [ ] **Pet Toys**: `catalog-v2/pet-services/pet-shop/pet-toys.jpeg`
- [ ] **Pet Medicines**: `catalog-v2/pet-services/pet-shop/pet-medicines.jpeg`

### Pet Services › Pet Insurance (1)

- [ ] **Pet Insurance Assistance**: `catalog-v2/pet-services/pet-insurance/pet-insurance-assistance.jpeg`

## Do last: tiles the owner may merge

Same rules as above: one tile picture, then one photo per service.

### Home Services › Elder Care (7)

- [ ] **Tile picture: Elder Care** (show a walking stick beside a cushioned chair): `tiles-v2/home-services/elder-care.jpeg`
- [ ] **Elder Care Attendant**: `catalog-v2/home-services/elder-care/elder-care-attendant.jpeg`
- [ ] **Companion Care**: `catalog-v2/home-services/elder-care/companion-care.jpeg`
- [ ] **Bedridden Patient Care**: `catalog-v2/home-services/elder-care/bedridden-patient-care.jpeg`
- [ ] **Babysitter**: `catalog-v2/home-services/elder-care/babysitter.jpeg`
- [ ] **Newborn Care**: `catalog-v2/home-services/elder-care/newborn-care.jpeg`
- [ ] **Nanny Service**: `catalog-v2/home-services/elder-care/nanny-service.jpeg`

### Home Services › Maid Services (6)

- [ ] **Tile picture: Maid Services** (show a laundry basket with a broom and dustpan): `tiles-v2/home-services/maid-services.jpeg`
- [ ] **Full Time Maid**: `catalog-v2/home-services/maid-services/full-time-maid.jpeg`
- [ ] **Part Time Maid**: `catalog-v2/home-services/maid-services/part-time-maid.jpeg`
- [ ] **Cook**: `catalog-v2/home-services/maid-services/cook.jpeg`
- [ ] **Housekeeping**: `catalog-v2/home-services/maid-services/housekeeping.jpeg`
- [ ] **Live-in Maid**: `catalog-v2/home-services/maid-services/live-in-maid.jpeg`

### Man Power & Support Staff › Event & Catering Staff (8)

- [ ] **Tile picture: Event & Catering Staff** (show a serving tray with glasses): `tiles-v2/manpower/event-catering-staff.jpeg`
- [ ] **Catering Boys**: `catalog-v2/manpower/event-catering-staff/catering-boys.jpeg`
- [ ] **Catering Girls**: `catalog-v2/manpower/event-catering-staff/catering-girls.jpeg`
- [ ] **Waiters**: `catalog-v2/manpower/event-catering-staff/waiters.jpeg`
- [ ] **Kitchen Helpers**: `catalog-v2/manpower/event-catering-staff/kitchen-helpers.jpeg`
- [ ] **Event Setup Staff**: `catalog-v2/manpower/event-catering-staff/event-setup-staff.jpeg`
- [ ] **Serving Staff**: `catalog-v2/manpower/event-catering-staff/serving-staff.jpeg`
- [ ] **Decoration Helpers**: `catalog-v2/manpower/event-catering-staff/decoration-helpers.jpeg`

### Man Power & Support Staff › Domestic Staff (7)

- [ ] **Tile picture: Domestic Staff** (show a kitchen apron with a cooking pot): `tiles-v2/manpower/domestic-staff.jpeg`
- [ ] **Maids**: `catalog-v2/manpower/domestic-staff/maids.jpeg`
- [ ] **Cooks**: `catalog-v2/manpower/domestic-staff/cooks.jpeg`
- [ ] **Babysitters**: `catalog-v2/manpower/domestic-staff/babysitters.jpeg`
- [ ] **Elder Care Staff**: `catalog-v2/manpower/domestic-staff/elder-care-staff.jpeg`
- [ ] **House Helpers**: `catalog-v2/manpower/domestic-staff/house-helpers.jpeg`
- [ ] **Patient Care Attendants**: `catalog-v2/manpower/domestic-staff/patient-care-attendants.jpeg`
