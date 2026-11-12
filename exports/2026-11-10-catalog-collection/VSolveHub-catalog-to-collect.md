# V Solve Hub catalog: what to collect

As of 10 November 2026.

## How to use this file

You are collecting photos and prices so the full V Solve Hub service list can go live. Most of it is already filled in; you only fill the gaps listed here.

- **Fill the empty table cells right in this file.** A cell with "–" needs nothing.
- **Tick a photo off** by changing `[ ]` to `[x]` once it is uploaded.
- **Not sure about something?** Write it in the Note column instead of guessing.
- **Work top to bottom.** Tile photos and prices matter most. The service photos at the end are optional and can wait.
- **When you finish,** send this file back to the owner. It is imported straight into the app, so keep service names exactly as written.

| What | How many | Section |
| --- | --- | --- |
| Category icons | 5 | Category icons |
| Tile photos | 121 | Tile photos |
| Prices and units | 277 services | Prices, units and job times |
| Job times | 120 services | Prices, units and job times |
| Day-hire hours and overtime | 22 roles | Day-hire roles |
| CSV fixes to confirm | 12 | CSV problems to confirm |
| Service photos (optional) | 608 | Optional service photos |

## Photo rules and uploading

Every photo is saved under the exact file name given in this file, then uploaded to Cloudflare. The app finds photos by these names, so a wrong name means a missing photo.

| | Tile and service photos | Category icons |
| --- | --- | --- |
| Format | JPG | PNG with a transparent background |
| Size | Square, 1024 x 1024 px | About 500 x 500 px |
| File size | Under 200 KB | Under 200 KB |
| Look | Real-looking Indian homes, workers and tools; one clear subject | Same 3D icon style as the icons already in the app |

- No text, logos, watermarks or brand names inside the image. Nothing blurry or stretched.
- Use only photos you are allowed to use: your own, AI-generated, or free-licence sites such as Unsplash and Pexels. Never Google Images.
- File names are all lowercase and use dashes, exactly as shown in this file.

**Uploading**

1. On your computer, make a folder called `catalog-v2` and recreate the folders shown in the file names inside it (for example `catalog-v2/vehicle/`).
2. In Cloudflare, open R2 and the bucket `vsolvehub` on the account that serves media.vsolvehub.com (account ID starts with `4d9ea6`). There is a second account with a bucket of the same name; do not use that one.
3. Upload the whole `catalog-v2` folder into the `Images/` folder of that bucket.
4. Check one photo opens in the browser, for example `https://media.vsolvehub.com/Images/catalog-v2/categories/vehicle.png`.
5. If you do not have Cloudflare access, zip the `catalog-v2` folder and send it to the owner instead.

## Category icons

Five categories have no icon yet. The other six already have one.

- [ ] **Rental Services**: `catalog-v2/categories/rental.png`
- [ ] **Vehicle Services**: `catalog-v2/categories/vehicle.png`
- [ ] **Rooms / PG / Hostel / Hotels**: `catalog-v2/categories/rooms-stays.png`
- [ ] **Careers**: `catalog-v2/categories/careers.png`
- [ ] **Man Power & Support Staff**: `catalog-v2/categories/manpower.png`

## Tile photos

121 tiles need a photo. These are the pictures customers tap on first, so they matter most. The other 41 tiles already have one.

### Construction Labour (23)

- [ ] **Helper**: `catalog-v2/construction-labour/helper.jpg`
- [ ] **Mason**: `catalog-v2/construction-labour/mason.jpg`
- [ ] **Shuttering Carpenter**: `catalog-v2/construction-labour/shuttering-carpenter.jpg`
- [ ] **Bar Bending (Steel Work)**: `catalog-v2/construction-labour/bar-bending-steel-work.jpg`
- [ ] **Concrete Labour**: `catalog-v2/construction-labour/concrete-labour.jpg`
- [ ] **Tile Worker**: `catalog-v2/construction-labour/tile-worker.jpg`
- [ ] **Painter**: `catalog-v2/construction-labour/painter.jpg`
- [ ] **Demolition Labour**: `catalog-v2/construction-labour/demolition-labour.jpg`
- [ ] **Welding Worker**: `catalog-v2/construction-labour/welding-worker.jpg`
- [ ] **Fabrication Worker**: `catalog-v2/construction-labour/fabrication-worker.jpg`
- [ ] **Scaffolding Worker**: `catalog-v2/construction-labour/scaffolding-worker.jpg`
- [ ] **Road & Civil Worker**: `catalog-v2/construction-labour/road-civil-worker.jpg`
- [ ] **Waterproofing Worker**: `catalog-v2/construction-labour/waterproofing-worker.jpg`
- [ ] **Interior Designer**: `catalog-v2/construction-labour/interior-designer.jpg`
- [ ] **Architect**: `catalog-v2/construction-labour/architect.jpg`
- [ ] **Civil Engineer**: `catalog-v2/construction-labour/civil-engineer.jpg`
- [ ] **Quantity Surveyor**: `catalog-v2/construction-labour/quantity-surveyor.jpg`
- [ ] **Site Supervisor**: `catalog-v2/construction-labour/site-supervisor.jpg`
- [ ] **Project Manager**: `catalog-v2/construction-labour/project-manager.jpg`
- [ ] **False Ceiling Worker**: `catalog-v2/construction-labour/false-ceiling-worker.jpg`
- [ ] **Glass & Aluminium Worker**: `catalog-v2/construction-labour/glass-aluminium-worker.jpg`
- [ ] **UPVC Worker**: `catalog-v2/construction-labour/upvc-worker.jpg`
- [ ] **Flooring Worker**: `catalog-v2/construction-labour/flooring-worker.jpg`

### Technician (3)

- [ ] **Solar Technician**: `catalog-v2/technician/solar-technician.jpg`
- [ ] **Lift Technician**: `catalog-v2/technician/lift-technician.jpg`
- [ ] **Watch Repair & Services**: `catalog-v2/technician/watch-repair-services.jpg`

### Beautician (1)

- [ ] **Bridal Packages**: `catalog-v2/beautician/bridal-packages.jpg`

### Event & Media Services (10)

- [ ] **Photography**: `catalog-v2/event-media/photography.jpg`
- [ ] **Videography**: `catalog-v2/event-media/videography.jpg`
- [ ] **Video Editing**: `catalog-v2/event-media/video-editing.jpg`
- [ ] **Photo Editing**: `catalog-v2/event-media/photo-editing.jpg`
- [ ] **Album & Printing**: `catalog-v2/event-media/album-printing.jpg`
- [ ] **Decoration**: `catalog-v2/event-media/decoration.jpg`
- [ ] **Catering**: `catalog-v2/event-media/catering.jpg`
- [ ] **DJ & Sound**: `catalog-v2/event-media/dj-sound.jpg`
- [ ] **Event Management**: `catalog-v2/event-media/event-management.jpg`
- [ ] **Entertainment Services**: `catalog-v2/event-media/entertainment-services.jpg`

### Rental Services (12)

- [ ] **Event Furniture Rental**: `catalog-v2/rental/event-furniture-rental.jpg`
- [ ] **Tent/Shamiana**: `catalog-v2/rental/tentshamiana.jpg`
- [ ] **Lighting Rental**: `catalog-v2/rental/lighting-rental.jpg`
- [ ] **Sound System Rental**: `catalog-v2/rental/sound-system-rental.jpg`
- [ ] **Decor Items Rent**: `catalog-v2/rental/decor-items-rent.jpg`
- [ ] **Catering Equipment**: `catalog-v2/rental/catering-equipment.jpg`
- [ ] **Construction Equipment**: `catalog-v2/rental/construction-equipment.jpg`
- [ ] **Home Appliance Rental**: `catalog-v2/rental/home-appliance-rental.jpg`
- [ ] **Furniture Rental (Home/Office)**: `catalog-v2/rental/furniture-rental-homeoffice.jpg`
- [ ] **Camera & Media Equipment**: `catalog-v2/rental/camera-media-equipment.jpg`
- [ ] **Tools & Machinery**: `catalog-v2/rental/tools-machinery.jpg`
- [ ] **Cooling/Heating**: `catalog-v2/rental/coolingheating.jpg`

### Vehicle Services (11)

- [ ] **Ride Booking**: `catalog-v2/vehicle/ride-booking.jpg`
- [ ] **Taxi Services**: `catalog-v2/vehicle/taxi-services.jpg`
- [ ] **Goods & Transportation**: `catalog-v2/vehicle/goods-transportation.jpg`
- [ ] **Instant Delivery**: `catalog-v2/vehicle/instant-delivery.jpg`
- [ ] **Vehicle Washing & Cleaning**: `catalog-v2/vehicle/vehicle-washing-cleaning.jpg`
- [ ] **Vehicle Servicing**: `catalog-v2/vehicle/vehicle-servicing.jpg`
- [ ] **Vehicle Repair Services**: `catalog-v2/vehicle/vehicle-repair-services.jpg`
- [ ] **Roadside Assistance**: `catalog-v2/vehicle/roadside-assistance.jpg`
- [ ] **Vehicle Rental Services**: `catalog-v2/vehicle/vehicle-rental-services.jpg`
- [ ] **EV Services**: `catalog-v2/vehicle/ev-services.jpg`
- [ ] **Vehicle Documents & Insurance**: `catalog-v2/vehicle/vehicle-documents-insurance.jpg`

### Rooms / PG / Hostel / Hotels (12)

- [ ] **Rooms**: `catalog-v2/rooms-stays/rooms.jpg`
- [ ] **PG Accommodation**: `catalog-v2/rooms-stays/pg-accommodation.jpg`
- [ ] **Hostels**: `catalog-v2/rooms-stays/hostels.jpg`
- [ ] **Bed Space**: `catalog-v2/rooms-stays/bed-space.jpg`
- [ ] **Co-Living Spaces**: `catalog-v2/rooms-stays/co-living-spaces.jpg`
- [ ] **Apartments**: `catalog-v2/rooms-stays/apartments.jpg`
- [ ] **Rental Properties**: `catalog-v2/rooms-stays/rental-properties.jpg`
- [ ] **Short Stay**: `catalog-v2/rooms-stays/short-stay.jpg`
- [ ] **Student Accommodation**: `catalog-v2/rooms-stays/student-accommodation.jpg`
- [ ] **Worker Accommodation**: `catalog-v2/rooms-stays/worker-accommodation.jpg`
- [ ] **Property Listing**: `catalog-v2/rooms-stays/property-listing.jpg`
- [ ] **Premium Stays**: `catalog-v2/rooms-stays/premium-stays.jpg`

### Careers (30)

- [ ] **Retail & Shop Staff**: `catalog-v2/careers/retail-shop-staff.jpg`
- [ ] **Health Care Jobs**: `catalog-v2/careers/health-care-jobs.jpg`
- [ ] **Hotels & Restaurant Jobs**: `catalog-v2/careers/hotels-restaurant-jobs.jpg`
- [ ] **Office & Admin Jobs**: `catalog-v2/careers/office-admin-jobs.jpg`
- [ ] **Delivery & Logistics Jobs**: `catalog-v2/careers/delivery-logistics-jobs.jpg`
- [ ] **Factory & Industrial Jobs**: `catalog-v2/careers/factory-industrial-jobs.jpg`
- [ ] **Construction Jobs**: `catalog-v2/careers/construction-jobs.jpg`
- [ ] **Technician Jobs**: `catalog-v2/careers/technician-jobs.jpg`
- [ ] **Vehicle & Transport Jobs**: `catalog-v2/careers/vehicle-transport-jobs.jpg`
- [ ] **Security Jobs**: `catalog-v2/careers/security-jobs.jpg`
- [ ] **Domestic Jobs**: `catalog-v2/careers/domestic-jobs.jpg`
- [ ] **Driver Jobs**: `catalog-v2/careers/driver-jobs.jpg`
- [ ] **Sales & Marketing Jobs**: `catalog-v2/careers/sales-marketing-jobs.jpg`
- [ ] **Customer Support Jobs**: `catalog-v2/careers/customer-support-jobs.jpg`
- [ ] **Event & Promotion Jobs**: `catalog-v2/careers/event-promotion-jobs.jpg`
- [ ] **Event & Media Jobs**: `catalog-v2/careers/event-media-jobs.jpg`
- [ ] **Education Jobs**: `catalog-v2/careers/education-jobs.jpg`
- [ ] **Cleaning & Maintenance Jobs**: `catalog-v2/careers/cleaning-maintenance-jobs.jpg`
- [ ] **IT & Software Jobs**: `catalog-v2/careers/it-software-jobs.jpg`
- [ ] **Finance & Accounts Jobs**: `catalog-v2/careers/finance-accounts-jobs.jpg`
- [ ] **Beauty & Wellness Jobs**: `catalog-v2/careers/beauty-wellness-jobs.jpg`
- [ ] **Business Services Jobs**: `catalog-v2/careers/business-services-jobs.jpg`
- [ ] **Banking & Insurance Jobs**: `catalog-v2/careers/banking-insurance-jobs.jpg`
- [ ] **Legal Jobs**: `catalog-v2/careers/legal-jobs.jpg`
- [ ] **HR & Recruitment Jobs**: `catalog-v2/careers/hr-recruitment-jobs.jpg`
- [ ] **Real Estate Jobs**: `catalog-v2/careers/real-estate-jobs.jpg`
- [ ] **BPO & Call Center Jobs**: `catalog-v2/careers/bpo-call-center-jobs.jpg`
- [ ] **Work From Home Jobs**: `catalog-v2/careers/work-from-home-jobs.jpg`
- [ ] **Freelance Jobs**: `catalog-v2/careers/freelance-jobs.jpg`
- [ ] **Internship Jobs**: `catalog-v2/careers/internship-jobs.jpg`

### Man Power & Support Staff (9)

- [ ] **Cleaning & Maintenance Staff**: `catalog-v2/manpower/cleaning-maintenance-staff.jpg`
- [ ] **Logistics & Handling**: `catalog-v2/manpower/logistics-handling.jpg`
- [ ] **Event & Catering Staff**: `catalog-v2/manpower/event-catering-staff.jpg`
- [ ] **Drivers & Transport Staff**: `catalog-v2/manpower/drivers-transport-staff.jpg`
- [ ] **Office Support Staff**: `catalog-v2/manpower/office-support-staff.jpg`
- [ ] **Domestic Staff**: `catalog-v2/manpower/domestic-staff.jpg`
- [ ] **Security Staff**: `catalog-v2/manpower/security-staff.jpg`
- [ ] **Retail Support Staff**: `catalog-v2/manpower/retail-support-staff.jpg`
- [ ] **Industrial Support Staff**: `catalog-v2/manpower/industrial-support-staff.jpg`

### Home Services (5)

- [ ] **Borewell Services**: `catalog-v2/home-services/borewell-services.jpg`
- [ ] **Home Shifting**: `catalog-v2/home-services/home-shifting.jpg`
- [ ] **Storage Services**: `catalog-v2/home-services/storage-services.jpg`
- [ ] **Elder Care**: `catalog-v2/home-services/elder-care.jpg`
- [ ] **Maid Services**: `catalog-v2/home-services/maid-services.jpg`

### Pet Services (5)

- [ ] **Pet Boarding**: `catalog-v2/pet-services/pet-boarding.jpg`
- [ ] **Pet Taxi**: `catalog-v2/pet-services/pet-taxi.jpg`
- [ ] **Pet Adoption**: `catalog-v2/pet-services/pet-adoption.jpg`
- [ ] **Pet Shop**: `catalog-v2/pet-services/pet-shop.jpg`
- [ ] **Pet Insurance**: `catalog-v2/pet-services/pet-insurance.jpg`

## Prices, units and job times

297 services are missing a price, a unit or a job time. Fill every empty cell; a cell with "–" needs nothing. Values already in a cell came from the CSV, so change them only if they are wrong.

- **Price:** what the customer pays in Hyderabad, in rupees. Numbers only: 499, not ₹499 or 499/-. Put the normal lowest price in min and the highest in max. For one fixed price, write the same number in both.
- **Unit:** what the price is for. Use one of: Per job, Per visit, Per day, Per hour, Per month, Per km, Per trip, Per sqft, Per rft, Per event, Per piece, Per package.
- **Job time:** the minutes a worker normally spends on one job, not counting travel. The app uses it to block the worker's calendar and decide which time slots customers see. Too short and workers arrive late to their next job; too long and customers see no free slots. A rough number is fine: switch repair 20, fan installation 30, car service 120, deep home cleaning 240.

### Construction Labour (31)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Interior Designer | Home Interior Design |  |  |  | – |  |
| Interior Designer | Office Interior Design |  |  |  | – |  |
| Interior Designer | Modular Kitchen Design |  |  |  | – |  |
| Interior Designer | Wardrobe Design |  |  |  | – |  |
| Interior Designer | False Ceiling Design |  |  |  | – |  |
| Interior Designer | 3D Interior Design |  |  |  | – |  |
| Interior Designer | Interior Consultation |  |  |  | – |  |
| Architect | House Plan |  |  |  | – |  |
| Architect | Building Plan Approval |  |  |  | – |  |
| Architect | 2D Floor Plan |  |  |  | – |  |
| Architect | 3D Elevation |  |  |  | – |  |
| Architect | Structural Drawing |  |  |  | – |  |
| Civil Engineer | Site Inspection |  |  |  | – |  |
| Civil Engineer | Estimation & Costing |  |  |  | – |  |
| Civil Engineer | Project Planning |  |  |  | – |  |
| Quantity Surveyor | BOQ Preparation |  |  |  | – |  |
| Quantity Surveyor | Quantity Estimation |  |  |  | – |  |
| Quantity Surveyor | Billing Support |  |  |  | – |  |
| Site Supervisor | Daily Site Supervision |  |  |  | – |  |
| Project Manager | Turnkey Project Management |  |  |  | – |  |
| False Ceiling Worker | Gypsum Ceiling |  |  |  | – |  |
| False Ceiling Worker | POP Ceiling |  |  |  | – |  |
| False Ceiling Worker | PVC Ceiling |  |  |  | – |  |
| Glass & Aluminium Worker | Toughened Glass |  |  |  | – |  |
| Glass & Aluminium Worker | Aluminium Partition |  |  |  | – |  |
| Glass & Aluminium Worker | ACP Cladding |  |  |  | – |  |
| UPVC Worker | UPVC Doors |  |  |  | – |  |
| UPVC Worker | UPVC Windows |  |  |  | – |  |
| Flooring Worker | Wooden Flooring |  |  |  | – |  |
| Flooring Worker | Vinyl Flooring |  |  |  | – |  |
| Flooring Worker | Epoxy Flooring |  |  |  | – |  |

### Technician (33)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Electrician | Switch Repair | Job | 99 | 149 |  |  |
| Electrician | Socket Repair | Job | 99 | 149 |  |  |
| Electrician | Bulb / Tube / LED Installation | Point | 99 | 149 |  |  |
| Electrician | Ceiling Fan Installation | Job | 199 | 349 |  |  |
| Plumbing | Tap Repair | Job | 149 | 299 |  |  |
| Plumbing | Flush Repair | Job | 149 | 499 |  |  |
| Carpenter | Cupboard Repair | Job | 199 | 999 |  |  |
| Carpenter | Hinge Fix | Job | 99 | 199 |  |  |
| RO Technician | Filter Replacement | Unit | 299 | 1500 |  |  |
| Computer & Laptop Technician | Screen Replacement | Job | 999 | 5000 |  |  |
| Mobile Technician | Screen Replacement | Job | 299 | 5000 |  |  |
| Mobile Technician | Battery Replacement | Job | 199 | 3000 |  |  |
| Mobile Technician | Camera Repair | Job | 299 | 3000 |  |  |
| CCTV & Security Technician | Camera Repair | Job | 299 | 1500 |  |  |
| Solar Technician | Solar Panel Installation |  |  |  |  |  |
| Solar Technician | Solar Maintenance |  |  |  |  |  |
| Solar Technician | Solar Cleaning |  |  |  |  |  |
| Lift Technician | Elevator Installation |  |  |  |  |  |
| Lift Technician | Lift Repair |  |  |  |  |  |
| Watch Repair & Services | Battery Replacement |  |  |  |  |  |
| Watch Repair & Services | Strap Replacement |  |  |  |  |  |
| Watch Repair & Services | Dial Repair |  |  |  |  |  |
| Watch Repair & Services | Glass Replacement |  |  |  |  |  |
| Watch Repair & Services | Crown Repair |  |  |  |  |  |
| Watch Repair & Services | Water Damage Repair |  |  |  |  |  |
| Watch Repair & Services | Complete Watch Servicing |  |  |  |  |  |
| Watch Repair & Services | Smart Watch Repair |  |  |  |  |  |
| Watch Repair & Services | Smart Watch Display Replacement |  |  |  |  |  |
| Watch Repair & Services | Smart Watch Battery Replacement |  |  |  |  |  |
| Watch Repair & Services | Button Repair |  |  |  |  |  |
| Watch Repair & Services | Waterproof Testing |  |  |  |  |  |
| Watch Repair & Services | Watch Polishing |  |  |  |  |  |
| Watch Repair & Services | Watch Cleaning |  |  |  |  |  |

### Beautician (7)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Waxing | Normal Wax | Service |  |  |  | CSV says 'Included'. Write 0 if normal wax costs nothing extra. |
| Waxing | Rica Wax | Service |  |  |  | CSV says 'Extra Premium'. Write the extra charge over normal wax. |
| Waxing | Chocolate Wax | Service |  |  |  | CSV says 'Extra Premium'. Write the extra charge over normal wax. |
| Bridal Packages | Pre-Bridal Package | Package | 5000 | 15000 |  | Includes: Face Cleanup, Facial, Detan, Threading, Waxing, Manicure, Pedicure |
| Bridal Packages | Bridal Full Package | Package | 10000 | 40000 |  | Includes: HD/Airbrush Makeup, Bridal Hair Styling, Saree Draping, False Eyelashes, Contact Lens Setting, Bridal Jewellery Setting, Touch-up Kit, Reception Look Guidance |
| Bridal Packages | Engagement Package | Package | 5000 | 15000 |  | Includes: Party Makeup, Hair Styling, Draping, False Eyelashes, Basic Jewellery Setting |
| Bridal Packages | Bridesmaid Makeup | Package | 2000 | 10000 |  | Includes: Makeup, Hair Styling, Draping |

### Event & Media Services (2)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Decoration | Site Visit & Consultation | Visit | 499 | 999 |  |  |
| DJ & Sound | Site Visit & Consultation | Visit | 499 | 999 |  |  |

### Vehicle Services (133)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Ride Booking | Bike Ride |  |  |  | – | Give the fare per km; write the minimum fare here. |
| Ride Booking | Auto Ride |  |  |  | – | Give the fare per km; write the minimum fare here. |
| Ride Booking | Taxi Ride |  |  |  | – | Give the fare per km; write the minimum fare here. |
| Ride Booking | Premium Cab Ride |  |  |  | – | Give the fare per km; write the minimum fare here. |
| Ride Booking | EV Ride |  |  |  | – | Give the fare per km; write the minimum fare here. |
| Taxi Services | Local Taxi |  |  |  | – |  |
| Taxi Services | Airport Pickup Taxi |  |  |  | – |  |
| Taxi Services | Airport Drop Taxi |  |  |  | – |  |
| Taxi Services | Outstation One Way Taxi |  |  |  | – |  |
| Taxi Services | Outstation Round Trip Taxi |  |  |  | – |  |
| Taxi Services | Hourly Taxi Booking |  |  |  | – |  |
| Taxi Services | Full Day Taxi Booking |  |  |  | – |  |
| Taxi Services | Premium Taxi |  |  |  | – |  |
| Taxi Services | SUV Taxi |  |  |  | – |  |
| Taxi Services | Innova Taxi |  |  |  | – |  |
| Taxi Services | Tempo Traveller Taxi |  |  |  | – |  |
| Taxi Services | Corporate Taxi |  |  |  | – |  |
| Taxi Services | Wedding Guest Transportation |  |  |  | – |  |
| Goods & Transportation | Tata Ace Booking |  |  |  | – |  |
| Goods & Transportation | Pickup Vehicle Booking |  |  |  | – |  |
| Goods & Transportation | Mini Truck Booking |  |  |  | – |  |
| Goods & Transportation | Truck Booking |  |  |  | – |  |
| Goods & Transportation | Tempo Traveller Transport |  |  |  | – |  |
| Goods & Transportation | Bus Transport |  |  |  | – |  |
| Goods & Transportation | Water Tanker Booking |  |  |  | – |  |
| Goods & Transportation | House Shifting |  |  |  | – |  |
| Goods & Transportation | Office Shifting |  |  |  | – |  |
| Goods & Transportation | Material Transport |  |  |  | – |  |
| Goods & Transportation | Furniture Transport |  |  |  | – |  |
| Goods & Transportation | Machinery Transport |  |  |  | – |  |
| Goods & Transportation | Construction Material Transport |  |  |  | – |  |
| Instant Delivery | Parcel Delivery |  |  |  | – |  |
| Instant Delivery | Document Delivery |  |  |  | – |  |
| Instant Delivery | Medicine Delivery |  |  |  | – |  |
| Instant Delivery | Grocery Delivery |  |  |  | – |  |
| Instant Delivery | Food Delivery |  |  |  | – |  |
| Instant Delivery | Flower Delivery |  |  |  | – |  |
| Instant Delivery | Fruits Delivery |  |  |  | – |  |
| Instant Delivery | Vegetables Delivery |  |  |  | – |  |
| Instant Delivery | Water Can Delivery |  |  |  | – |  |
| Instant Delivery | Milk Delivery |  |  |  | – |  |
| Instant Delivery | Small Package Delivery |  |  |  | – |  |
| Vehicle Washing & Cleaning | Bike Wash |  |  |  |  |  |
| Vehicle Washing & Cleaning | Car Wash |  |  |  |  |  |
| Vehicle Washing & Cleaning | Foam Wash |  |  |  |  |  |
| Vehicle Washing & Cleaning | Interior Cleaning |  |  |  |  |  |
| Vehicle Washing & Cleaning | Exterior Cleaning |  |  |  |  |  |
| Vehicle Washing & Cleaning | Vacuum Cleaning |  |  |  |  |  |
| Vehicle Washing & Cleaning | Engine Bay Cleaning |  |  |  |  |  |
| Vehicle Washing & Cleaning | Headlight Restoration |  |  |  |  |  |
| Vehicle Washing & Cleaning | Polishing |  |  |  |  |  |
| Vehicle Washing & Cleaning | Detailing |  |  |  |  |  |
| Vehicle Washing & Cleaning | Ceramic Coating |  |  |  |  |  |
| Vehicle Washing & Cleaning | Teflon Coating |  |  |  |  |  |
| Vehicle Servicing | Basic Inspection |  |  |  |  |  |
| Vehicle Servicing | Bike Service |  |  |  |  |  |
| Vehicle Servicing | Car Service |  |  |  |  |  |
| Vehicle Servicing | EV Service |  |  |  |  |  |
| Vehicle Servicing | Commercial Vehicle Service |  |  |  |  |  |
| Vehicle Servicing | Periodic Service |  |  |  |  |  |
| Vehicle Servicing | Engine Oil Change |  |  |  |  |  |
| Vehicle Servicing | Filter Replacement |  |  |  |  |  |
| Vehicle Servicing | AC Service |  |  |  |  |  |
| Vehicle Servicing | Battery Checkup |  |  |  |  |  |
| Vehicle Servicing | Wheel Alignment |  |  |  |  |  |
| Vehicle Servicing | Wheel Balancing |  |  |  |  |  |
| Vehicle Servicing | Full Vehicle Checkup |  |  |  |  |  |
| Vehicle Repair Services | Engine Repair |  |  |  |  |  |
| Vehicle Repair Services | Clutch Repair |  |  |  |  |  |
| Vehicle Repair Services | Brake Repair |  |  |  |  |  |
| Vehicle Repair Services | Suspension Repair |  |  |  |  |  |
| Vehicle Repair Services | Electrical Repair |  |  |  |  |  |
| Vehicle Repair Services | Starter Repair |  |  |  |  |  |
| Vehicle Repair Services | Alternator Repair |  |  |  |  |  |
| Vehicle Repair Services | Radiator Repair |  |  |  |  |  |
| Vehicle Repair Services | Battery Repair |  |  |  |  |  |
| Vehicle Repair Services | AC Repair |  |  |  |  |  |
| Vehicle Repair Services | Gearbox Repair |  |  |  |  |  |
| Vehicle Repair Services | Silencer Repair |  |  |  |  |  |
| Vehicle Repair Services | Fuel System Repair |  |  |  |  |  |
| Vehicle Repair Services | Denting & Painting |  |  |  |  |  |
| Vehicle Repair Services | Windshield Repair |  |  |  |  |  |
| Roadside Assistance | Breakdown Assistance |  |  |  |  |  |
| Roadside Assistance | Emergency Repair |  |  |  |  |  |
| Roadside Assistance | On-Site Inspection |  |  |  |  |  |
| Roadside Assistance | Battery Jump Start |  |  |  |  |  |
| Roadside Assistance | Battery Replacement |  |  |  |  |  |
| Roadside Assistance | Battery Charging |  |  |  |  |  |
| Roadside Assistance | Puncture Repair |  |  |  |  |  |
| Roadside Assistance | Tyre Replacement |  |  |  |  |  |
| Roadside Assistance | Wheel Alignment |  |  |  |  |  |
| Roadside Assistance | Wheel Balancing |  |  |  |  |  |
| Roadside Assistance | Emergency Fuel Delivery |  |  |  |  |  |
| Roadside Assistance | Wrong Fuel Assistance |  |  |  |  |  |
| Roadside Assistance | Key Unlock Service |  |  |  |  |  |
| Roadside Assistance | Lost Key Assistance |  |  |  |  |  |
| Roadside Assistance | Duplicate Key Service |  |  |  |  |  |
| Roadside Assistance | Local Towing |  |  |  |  |  |
| Roadside Assistance | Long Distance Towing |  |  |  |  |  |
| Roadside Assistance | Flatbed Towing |  |  |  |  |  |
| Roadside Assistance | Accident Recovery |  |  |  |  |  |
| Vehicle Rental Services | Bike Rental |  |  |  | – |  |
| Vehicle Rental Services | Scooter Rental |  |  |  | – |  |
| Vehicle Rental Services | Auto Rental |  |  |  | – |  |
| Vehicle Rental Services | Car Rental (Self Drive) |  |  |  | – |  |
| Vehicle Rental Services | Car Rental (With Driver) |  |  |  | – |  |
| Vehicle Rental Services | Luxury Car Rental |  |  |  | – |  |
| Vehicle Rental Services | Wedding Car Rental |  |  |  | – |  |
| Vehicle Rental Services | EV Vehicle Rental |  |  |  | – |  |
| Vehicle Rental Services | Van Rental |  |  |  | – |  |
| Vehicle Rental Services | Tempo Traveller Rental |  |  |  | – |  |
| Vehicle Rental Services | Mini Bus Rental |  |  |  | – |  |
| Vehicle Rental Services | Bus Rental |  |  |  | – |  |
| Vehicle Rental Services | Truck Rental |  |  |  | – |  |
| Vehicle Rental Services | Pickup Vehicle Rental |  |  |  | – |  |
| Vehicle Rental Services | Water Tanker Rental |  |  |  | – |  |
| EV Services | Battery Health Check |  |  |  |  |  |
| EV Services | Charging System Check |  |  |  |  |  |
| EV Services | Motor Inspection |  |  |  |  |  |
| EV Services | Controller Diagnostics |  |  |  |  |  |
| EV Services | Mobile Charging Support |  |  |  |  |  |
| EV Services | Battery Assistance |  |  |  |  |  |
| EV Services | EV Towing |  |  |  |  |  |
| EV Services | EV Charger Installation |  |  |  |  |  |
| Vehicle Documents & Insurance | New Insurance |  |  |  | – |  |
| Vehicle Documents & Insurance | Insurance Renewal |  |  |  | – |  |
| Vehicle Documents & Insurance | Claim Assistance |  |  |  | – |  |
| Vehicle Documents & Insurance | RC Transfer |  |  |  | – |  |
| Vehicle Documents & Insurance | Fitness Certificate |  |  |  | – |  |
| Vehicle Documents & Insurance | Pollution Certificate |  |  |  | – |  |
| Vehicle Documents & Insurance | Permit Renewal |  |  |  | – |  |
| Vehicle Documents & Insurance | Loan Closure Assistance |  |  |  | – |  |
| Vehicle Documents & Insurance | Challan Assistance |  |  |  | – |  |

### Man Power & Support Staff (50)

These staff are usually hired per day or per month. Use whichever unit customers are normally quoted.

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Cleaning & Maintenance Staff | Housekeeping Staff |  |  |  | – |  |
| Cleaning & Maintenance Staff | Office Cleaning Staff |  |  |  | – |  |
| Cleaning & Maintenance Staff | Janitors |  |  |  | – |  |
| Cleaning & Maintenance Staff | Deep Cleaning Teams |  |  |  | – |  |
| Cleaning & Maintenance Staff | Maintenance Workers |  |  |  | – |  |
| Cleaning & Maintenance Staff | Pest Control Helpers |  |  |  | – |  |
| Logistics & Handling | Loading Staff |  |  |  | – |  |
| Logistics & Handling | Unloading Staff |  |  |  | – |  |
| Logistics & Handling | Packers & Movers Staff |  |  |  | – |  |
| Logistics & Handling | Delivery Helpers |  |  |  | – |  |
| Logistics & Handling | Warehouse Helpers |  |  |  | – |  |
| Logistics & Handling | Material Handling Staff |  |  |  | – |  |
| Event & Catering Staff | Catering Boys |  |  |  | – |  |
| Event & Catering Staff | Catering Girls |  |  |  | – |  |
| Event & Catering Staff | Waiters |  |  |  | – |  |
| Event & Catering Staff | Kitchen Helpers |  |  |  | – |  |
| Event & Catering Staff | Event Setup Staff |  |  |  | – |  |
| Event & Catering Staff | Serving Staff |  |  |  | – |  |
| Event & Catering Staff | Decoration Helpers |  |  |  | – |  |
| Drivers & Transport Staff | Car Drivers |  |  |  | – |  |
| Drivers & Transport Staff | Truck Drivers |  |  |  | – |  |
| Drivers & Transport Staff | Tempo Drivers |  |  |  | – |  |
| Drivers & Transport Staff | Bus Drivers |  |  |  | – |  |
| Drivers & Transport Staff | Temporary Drivers |  |  |  | – |  |
| Drivers & Transport Staff | Permanent Drivers |  |  |  | – |  |
| Office Support Staff | Office Boys |  |  |  | – |  |
| Office Support Staff | Office Assistants |  |  |  | – |  |
| Office Support Staff | Data Entry Operators |  |  |  | – |  |
| Office Support Staff | Receptionists |  |  |  | – |  |
| Office Support Staff | File Management Staff |  |  |  | – |  |
| Office Support Staff | Front Office Staff |  |  |  | – |  |
| Domestic Staff | Maids |  |  |  | – |  |
| Domestic Staff | Cooks |  |  |  | – |  |
| Domestic Staff | Babysitters |  |  |  | – |  |
| Domestic Staff | Elder Care Staff |  |  |  | – |  |
| Domestic Staff | House Helpers |  |  |  | – |  |
| Domestic Staff | Patient Care Attendants |  |  |  | – |  |
| Security Staff | Security Guards |  |  |  | – |  |
| Security Staff | Bouncers |  |  |  | – |  |
| Security Staff | Watchmen |  |  |  | – |  |
| Security Staff | Gate Security Staff |  |  |  | – |  |
| Security Staff | Event Security Staff |  |  |  | – |  |
| Retail Support Staff | Sales Boys |  |  |  | – |  |
| Retail Support Staff | Sales Girls |  |  |  | – |  |
| Retail Support Staff | Store Helpers |  |  |  | – |  |
| Retail Support Staff | Cash Counter Assistants |  |  |  | – |  |
| Industrial Support Staff | Factory Helpers |  |  |  | – |  |
| Industrial Support Staff | Packing Staff |  |  |  | – |  |
| Industrial Support Staff | Assembly Line Helpers |  |  |  | – |  |
| Industrial Support Staff | Production Helpers |  |  |  | – |  |

### Home Services (24)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Borewell Services | Borewell Cleaning |  |  |  |  |  |
| Borewell Services | Borewell Repair |  |  |  |  |  |
| Borewell Services | Borewell Motor Installation |  |  |  |  |  |
| Home Shifting | House Shifting |  |  |  | – |  |
| Home Shifting | Packing Service |  |  |  | – |  |
| Home Shifting | Unpacking Service |  |  |  | – |  |
| Home Shifting | Loading & Unloading |  |  |  | – |  |
| Home Shifting | Furniture Shifting |  |  |  | – |  |
| Home Shifting | Office Shifting |  |  |  | – |  |
| Storage Services | Household Storage |  |  |  | – |  |
| Storage Services | Office Storage |  |  |  | – |  |
| Storage Services | Warehouse Storage |  |  |  | – |  |
| Elder Care | Elder Care Attendant |  |  |  | – |  |
| Elder Care | Companion Care |  |  |  | – |  |
| Elder Care | Bedridden Patient Care |  |  |  | – |  |
| Elder Care | Babysitter |  |  |  | – |  |
| Elder Care | Newborn Care |  |  |  | – |  |
| Elder Care | Nanny Service |  |  |  | – |  |
| Maid Services | Full Time Maid |  |  |  | – |  |
| Maid Services | Part Time Maid |  |  |  | – |  |
| Maid Services | Cook |  |  |  | – |  |
| Maid Services | Housekeeping |  |  |  | – |  |
| Maid Services | Live-in Maid |  |  |  | – |  |
| Home Maintenance | Annual Home Maintenance Contract (AMC) |  |  |  |  |  |

### Pet Services (17)

| Tile | Service | Unit | Price min ₹ | Price max ₹ | Job time (min) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Pet Grooming | Bath & Spa |  |  |  |  |  |
| Pet Grooming | Hair Trimming |  |  |  |  |  |
| Pet Grooming | Nail Clipping |  |  |  |  |  |
| Pet Grooming | Ear Cleaning |  |  |  |  |  |
| Pet Grooming | Teeth Cleaning |  |  |  |  |  |
| Veterinary | Emergency Vet |  |  |  |  |  |
| Pet Boarding | Dog Boarding |  |  |  | – |  |
| Pet Boarding | Cat Boarding |  |  |  | – |  |
| Pet Boarding | Day Care |  |  |  | – |  |
| Pet Taxi | Pet Pickup & Drop |  |  |  |  |  |
| Pet Adoption | Dog Adoption |  |  |  | – | Adoption is not a paid service. Ask the owner before collecting a price. |
| Pet Adoption | Cat Adoption |  |  |  | – | Adoption is not a paid service. Ask the owner before collecting a price. |
| Pet Shop | Pet Food |  |  |  | – | These are products, not services. Ask the owner before collecting prices. |
| Pet Shop | Pet Accessories |  |  |  | – | These are products, not services. Ask the owner before collecting prices. |
| Pet Shop | Pet Toys |  |  |  | – | These are products, not services. Ask the owner before collecting prices. |
| Pet Shop | Pet Medicines |  |  |  | – | These are products, not services. Ask the owner before collecting prices. |
| Pet Insurance | Pet Insurance Assistance |  |  |  | – |  |

## Day-hire roles

22 roles are booked by the day. For each one, write how many hours make one working day and the overtime charge per extra hour. Day prices for construction roles come from the CSV, so correct them only if they are wrong. Man Power prices go in the prices tables above.

| Category | Role | Price per day min ₹ | Price per day max ₹ | Hours in one day | Overtime ₹ per hour |
| --- | --- | --- | --- | --- | --- |
| Construction Labour | Helper | 700 | 900 |  |  |
| Construction Labour | Mason | 900 | 1800 |  |  |
| Construction Labour | Shuttering Carpenter | 900 | 1500 |  |  |
| Construction Labour | Bar Bending (Steel Work) | 900 | 1400 |  |  |
| Construction Labour | Concrete Labour | 600 | 900 |  |  |
| Construction Labour | Tile Worker | 700 | 1800 |  |  |
| Construction Labour | Painter | 700 | 1800 |  |  |
| Construction Labour | Demolition Labour | 600 | 1200 |  |  |
| Construction Labour | Welding Worker | 1000 | 1800 |  |  |
| Construction Labour | Fabrication Worker | 1000 | 2200 |  |  |
| Construction Labour | Scaffolding Worker | 800 | 1300 |  |  |
| Construction Labour | Road & Civil Worker | 900 | 1800 |  |  |
| Construction Labour | Waterproofing Worker | 1000 | 2200 |  |  |
| Man Power & Support Staff | Cleaning & Maintenance Staff | – | – |  |  |
| Man Power & Support Staff | Logistics & Handling | – | – |  |  |
| Man Power & Support Staff | Event & Catering Staff | – | – |  |  |
| Man Power & Support Staff | Drivers & Transport Staff | – | – |  |  |
| Man Power & Support Staff | Office Support Staff | – | – |  |  |
| Man Power & Support Staff | Domestic Staff | – | – |  |  |
| Man Power & Support Staff | Security Staff | – | – |  |  |
| Man Power & Support Staff | Retail Support Staff | – | – |  |  |
| Man Power & Support Staff | Industrial Support Staff | – | – |  |  |

## CSV problems to confirm

The original CSV had 12 broken cells, and each one is already fixed in this file. Write OK in the last column, or the right value if a fix is wrong.

| CSV line | Where | Problem | What was done | Your answer |
| --- | --- | --- | --- | --- |
| 375 | Waxing / Normal Wax | Price is the word "Included" | Left blank; fill it in the Beautician prices table |  |
| 376 | Waxing / Rica Wax | Price is the words "Extra Premium" | Left blank; fill it in the Beautician prices table |  |
| 377 | Waxing / Chocolate Wax | Price is the words "Extra Premium" | Left blank; fill it in the Beautician prices table |  |
| 450 | Beautician / Bridal Packages | Package contents sit in the Unit column, and 3 packages are listed twice | Kept 4 packages; contents moved into the Note column |  |
| 537 | Album & Printing / Photo Printing | Price shows "Oct-50": Excel turned 10-50 into a date | Set to 10 to 50 |  |
| 598 | Event Furniture Rental / Plastic Chair | Price shows "Oct-20": Excel turned 10-20 into a date | Set to 10 to 20 |  |
| 620 | Lighting Rental / LED Lights | Price "20-50/unit" has "/unit" stuck to it | Set to 20 to 50 |  |
| 621 | Lighting Rental / Focus Lights | Price "200-500/unit" has "/unit" stuck to it | Set to 200 to 500 |  |
| 641 | Rental Services / Decor Items Rent | "Décor" shows as a broken character in some apps | Named "Decor Items Rent", as in the app |  |
| 654 | Catering Equipment / Plates & Glasses | Price shows "May-20": Excel turned 5-20 into a date | Set to 5 to 20 |  |
| 662 | Construction Equipment / Scaffolding | Price shows "May-20": Excel turned 5-20 into a date | Set to 5 to 20 |  |
| 663 | Construction Equipment / Centering Material | Price shows "Oct-30": Excel turned 10-30 into a date | Set to 10 to 30 |  |

## Already done

These need nothing from you.

- **385 services are already in the app with prices:** Technician 131, Beautician 80, Home Services 62, Pet Services 11 and Rental Services 101. Rental items have no photos yet; they are in the optional photos list below.
- **Careers (222 job types) and Rooms / PG (93 room types)** need no prices. Employers and hosts enter those details in the app; only their tile photos are needed.
- **Price ranges** need no explaining. The app shows the low end of each range as the "starts at" price.
- **6 categories and 41 tiles** already have photos.

## Optional service photos

These 608 photos are optional; do them after everything above. A service without its own photo shows its tile photo instead. Save each photo in the folder named above its group, under the file name shown, and tick it once uploaded. The photo rules above apply.

### Construction Labour (116)

**Helper**: folder `catalog-v2/construction-labour/helper/`

- [ ] Site Cleaning: `site-cleaning.jpg`
- [ ] Material Shifting (Sand): `material-shifting-sand.jpg`
- [ ] Material Shifting (Cement): `material-shifting-cement.jpg`
- [ ] Material Shifting (Bricks): `material-shifting-bricks.jpg`
- [ ] Loading & Unloading: `loading-unloading.jpg`
- [ ] Water Curing: `water-curing.jpg`
- [ ] Concrete Mixing Support: `concrete-mixing-support.jpg`
- [ ] Debris Removal: `debris-removal.jpg`
- [ ] Tools Handling: `tools-handling.jpg`
- [ ] General Work Support: `general-work-support.jpg`

**Mason**: folder `catalog-v2/construction-labour/mason/`

- [ ] Brick Work: `brick-work.jpg`
- [ ] Block Work: `block-work.jpg`
- [ ] Plastering Work: `plastering-work.jpg`
- [ ] Tile Fixing: `tile-fixing.jpg`
- [ ] Stone Work: `stone-work.jpg`
- [ ] Concrete Work: `concrete-work.jpg`
- [ ] Repair Work: `repair-work.jpg`
- [ ] Compound Wall Construction: `compound-wall-construction.jpg`
- [ ] Drain Construction: `drain-construction.jpg`
- [ ] PCC Work: `pcc-work.jpg`

**Shuttering Carpenter**: folder `catalog-v2/construction-labour/shuttering-carpenter/`

- [ ] Footing Shuttering: `footing-shuttering.jpg`
- [ ] Column Shuttering: `column-shuttering.jpg`
- [ ] Beam Shuttering: `beam-shuttering.jpg`
- [ ] Slab Centering: `slab-centering.jpg`
- [ ] Staircase Shuttering: `staircase-shuttering.jpg`
- [ ] Formwork Dismantling: `formwork-dismantling.jpg`
- [ ] Scaffolding Support: `scaffolding-support.jpg`
- [ ] Retaining Wall Shuttering: `retaining-wall-shuttering.jpg`

**Bar Bending (Steel Work)**: folder `catalog-v2/construction-labour/bar-bending-steel-work/`

- [ ] Steel Cutting: `steel-cutting.jpg`
- [ ] Steel Bending: `steel-bending.jpg`
- [ ] Steel Binding: `steel-binding.jpg`
- [ ] Footing Reinforcement: `footing-reinforcement.jpg`
- [ ] Column Reinforcement: `column-reinforcement.jpg`
- [ ] Beam Reinforcement: `beam-reinforcement.jpg`
- [ ] Slab Reinforcement: `slab-reinforcement.jpg`
- [ ] Staircase Reinforcement: `staircase-reinforcement.jpg`

**Concrete Labour**: folder `catalog-v2/construction-labour/concrete-labour/`

- [ ] Concrete Mixing: `concrete-mixing.jpg`
- [ ] Concrete Pouring: `concrete-pouring.jpg`
- [ ] Vibrator Support: `vibrator-support.jpg`
- [ ] Surface Levelling: `surface-levelling.jpg`
- [ ] Concrete Finishing: `concrete-finishing.jpg`
- [ ] Water Curing: `water-curing.jpg`

**Tile Worker**: folder `catalog-v2/construction-labour/tile-worker/`

- [ ] Floor Tile Fixing: `floor-tile-fixing.jpg`
- [ ] Wall Tile Fixing: `wall-tile-fixing.jpg`
- [ ] Bathroom Tile Work: `bathroom-tile-work.jpg`
- [ ] Kitchen Tile Work: `kitchen-tile-work.jpg`
- [ ] Granite Fixing: `granite-fixing.jpg`
- [ ] Marble Fixing: `marble-fixing.jpg`
- [ ] Tile Repair Work: `tile-repair-work.jpg`
- [ ] Tile Grouting: `tile-grouting.jpg`

**Painter**: folder `catalog-v2/construction-labour/painter/`

- [ ] Interior Painting: `interior-painting.jpg`
- [ ] Exterior Painting: `exterior-painting.jpg`
- [ ] Wall Putty: `wall-putty.jpg`
- [ ] Primer Coating: `primer-coating.jpg`
- [ ] Texture Painting: `texture-painting.jpg`
- [ ] Polish Work: `polish-work.jpg`
- [ ] Waterproof Coating: `waterproof-coating.jpg`
- [ ] Enamel Painting: `enamel-painting.jpg`

**Demolition Labour**: folder `catalog-v2/construction-labour/demolition-labour/`

- [ ] Wall Breaking: `wall-breaking.jpg`
- [ ] Concrete Breaking: `concrete-breaking.jpg`
- [ ] Debris Removal: `debris-removal.jpg`
- [ ] Waste Shifting: `waste-shifting.jpg`
- [ ] Site Cleaning: `site-cleaning.jpg`
- [ ] Floor Breaking: `floor-breaking.jpg`
- [ ] Roof Demolition: `roof-demolition.jpg`

**Welding Worker**: folder `catalog-v2/construction-labour/welding-worker/`

- [ ] Gate Welding: `gate-welding.jpg`
- [ ] Steel Structure Welding: `steel-structure-welding.jpg`
- [ ] Railing Welding: `railing-welding.jpg`
- [ ] Grill Welding: `grill-welding.jpg`
- [ ] Fabrication Welding: `fabrication-welding.jpg`

**Fabrication Worker**: folder `catalog-v2/construction-labour/fabrication-worker/`

- [ ] Steel Fabrication: `steel-fabrication.jpg`
- [ ] Shed Fabrication: `shed-fabrication.jpg`
- [ ] Structural Fabrication: `structural-fabrication.jpg`
- [ ] Industrial Fabrication: `industrial-fabrication.jpg`

**Scaffolding Worker**: folder `catalog-v2/construction-labour/scaffolding-worker/`

- [ ] Scaffolding Erection: `scaffolding-erection.jpg`
- [ ] Scaffolding Dismantling: `scaffolding-dismantling.jpg`
- [ ] Scaffolding Maintenance: `scaffolding-maintenance.jpg`

**Road & Civil Worker**: folder `catalog-v2/construction-labour/road-civil-worker/`

- [ ] Paver Block Work: `paver-block-work.jpg`
- [ ] Drainage Work: `drainage-work.jpg`
- [ ] Road Repair Work: `road-repair-work.jpg`
- [ ] Culvert Work: `culvert-work.jpg`

**Waterproofing Worker**: folder `catalog-v2/construction-labour/waterproofing-worker/`

- [ ] Terrace Waterproofing: `terrace-waterproofing.jpg`
- [ ] Bathroom Waterproofing: `bathroom-waterproofing.jpg`
- [ ] Wall Waterproofing: `wall-waterproofing.jpg`
- [ ] Basement Waterproofing: `basement-waterproofing.jpg`

**Interior Designer**: folder `catalog-v2/construction-labour/interior-designer/`

- [ ] Home Interior Design: `home-interior-design.jpg`
- [ ] Office Interior Design: `office-interior-design.jpg`
- [ ] Modular Kitchen Design: `modular-kitchen-design.jpg`
- [ ] Wardrobe Design: `wardrobe-design.jpg`
- [ ] False Ceiling Design: `false-ceiling-design.jpg`
- [ ] 3D Interior Design: `3d-interior-design.jpg`
- [ ] Interior Consultation: `interior-consultation.jpg`

**Architect**: folder `catalog-v2/construction-labour/architect/`

- [ ] House Plan: `house-plan.jpg`
- [ ] Building Plan Approval: `building-plan-approval.jpg`
- [ ] 2D Floor Plan: `2d-floor-plan.jpg`
- [ ] 3D Elevation: `3d-elevation.jpg`
- [ ] Structural Drawing: `structural-drawing.jpg`

**Civil Engineer**: folder `catalog-v2/construction-labour/civil-engineer/`

- [ ] Site Inspection: `site-inspection.jpg`
- [ ] Estimation & Costing: `estimation-costing.jpg`
- [ ] Project Planning: `project-planning.jpg`

**Quantity Surveyor**: folder `catalog-v2/construction-labour/quantity-surveyor/`

- [ ] BOQ Preparation: `boq-preparation.jpg`
- [ ] Quantity Estimation: `quantity-estimation.jpg`
- [ ] Billing Support: `billing-support.jpg`

**Site Supervisor**: folder `catalog-v2/construction-labour/site-supervisor/`

- [ ] Daily Site Supervision: `daily-site-supervision.jpg`

**Project Manager**: folder `catalog-v2/construction-labour/project-manager/`

- [ ] Turnkey Project Management: `turnkey-project-management.jpg`

**False Ceiling Worker**: folder `catalog-v2/construction-labour/false-ceiling-worker/`

- [ ] Gypsum Ceiling: `gypsum-ceiling.jpg`
- [ ] POP Ceiling: `pop-ceiling.jpg`
- [ ] PVC Ceiling: `pvc-ceiling.jpg`

**Glass & Aluminium Worker**: folder `catalog-v2/construction-labour/glass-aluminium-worker/`

- [ ] Toughened Glass: `toughened-glass.jpg`
- [ ] Aluminium Partition: `aluminium-partition.jpg`
- [ ] ACP Cladding: `acp-cladding.jpg`

**UPVC Worker**: folder `catalog-v2/construction-labour/upvc-worker/`

- [ ] UPVC Doors: `upvc-doors.jpg`
- [ ] UPVC Windows: `upvc-windows.jpg`

**Flooring Worker**: folder `catalog-v2/construction-labour/flooring-worker/`

- [ ] Wooden Flooring: `wooden-flooring.jpg`
- [ ] Vinyl Flooring: `vinyl-flooring.jpg`
- [ ] Epoxy Flooring: `epoxy-flooring.jpg`

### Technician (51)

**Electrician**: folder `catalog-v2/technician/electrician/`

- [ ] Switch Repair: `switch-repair.jpg`
- [ ] Socket Repair: `socket-repair.jpg`
- [ ] Bulb / Tube / LED Installation: `bulb-tube-led-installation.jpg`
- [ ] Ceiling Fan Installation: `ceiling-fan-installation.jpg`
- [ ] New House Wiring: `new-house-wiring.jpg`
- [ ] Old Wiring Replacement: `old-wiring-replacement.jpg`
- [ ] Concealed Wiring: `concealed-wiring.jpg`
- [ ] Open Wiring: `open-wiring.jpg`
- [ ] Conduit Pipe Laying: `conduit-pipe-laying.jpg`
- [ ] Cable Pulling: `cable-pulling.jpg`

**Plumbing**: folder `catalog-v2/technician/plumbing/`

- [ ] Tap Repair: `tap-repair.jpg`
- [ ] Flush Repair: `flush-repair.jpg`
- [ ] New Pipeline Installation: `new-pipeline-installation.jpg`
- [ ] Old Pipe Replacement: `old-pipe-replacement.jpg`
- [ ] Pipe Extension Work: `pipe-extension-work.jpg`
- [ ] Underground Pipeline Work: `underground-pipeline-work.jpg`
- [ ] Drain Line Installation: `drain-line-installation.jpg`
- [ ] Sewer Line Work: `sewer-line-work.jpg`

**Carpenter**: folder `catalog-v2/technician/carpenter/`

- [ ] Cupboard Repair: `cupboard-repair.jpg`
- [ ] Hinge Fix: `hinge-fix.jpg`
- [ ] Wood Polishing: `wood-polishing.jpg`
- [ ] Laminate Fixing: `laminate-fixing.jpg`

**RO Technician**: folder `catalog-v2/technician/ro-technician/`

- [ ] Filter Replacement: `filter-replacement.jpg`

**Internet & WiFi Technician**: folder `catalog-v2/technician/internet-technician/`

- [ ] LAN Cable Wiring: `lan-cable-wiring.jpg`

**Computer & Laptop Technician**: folder `catalog-v2/technician/computer-technician/`

- [ ] Screen Replacement: `screen-replacement.jpg`

**Mobile Technician**: folder `catalog-v2/technician/mobile-technician/`

- [ ] Screen Replacement: `screen-replacement.jpg`
- [ ] Battery Replacement: `battery-replacement.jpg`
- [ ] Camera Repair: `camera-repair.jpg`

**CCTV & Security Technician**: folder `catalog-v2/technician/cctv-technician/`

- [ ] Full CCTV Setup: `full-cctv-setup.jpg`
- [ ] CCTV Wiring: `cctv-wiring.jpg`
- [ ] Camera Repair: `camera-repair.jpg`

**Home Automation & Sound**: folder `catalog-v2/technician/home-automation-technician/`

- [ ] Smart Home Setup: `smart-home-setup.jpg`

**Solar Technician**: folder `catalog-v2/technician/solar-technician/`

- [ ] Solar Panel Installation: `solar-panel-installation.jpg`
- [ ] Solar Maintenance: `solar-maintenance.jpg`
- [ ] Solar Cleaning: `solar-cleaning.jpg`

**Lift Technician**: folder `catalog-v2/technician/lift-technician/`

- [ ] Elevator Installation: `elevator-installation.jpg`
- [ ] Lift Repair: `lift-repair.jpg`

**Watch Repair & Services**: folder `catalog-v2/technician/watch-repair-services/`

- [ ] Battery Replacement: `battery-replacement.jpg`
- [ ] Strap Replacement: `strap-replacement.jpg`
- [ ] Dial Repair: `dial-repair.jpg`
- [ ] Glass Replacement: `glass-replacement.jpg`
- [ ] Crown Repair: `crown-repair.jpg`
- [ ] Water Damage Repair: `water-damage-repair.jpg`
- [ ] Complete Watch Servicing: `complete-watch-servicing.jpg`
- [ ] Smart Watch Repair: `smart-watch-repair.jpg`
- [ ] Smart Watch Display Replacement: `smart-watch-display-replacement.jpg`
- [ ] Smart Watch Battery Replacement: `smart-watch-battery-replacement.jpg`
- [ ] Button Repair: `button-repair.jpg`
- [ ] Waterproof Testing: `waterproof-testing.jpg`
- [ ] Watch Polishing: `watch-polishing.jpg`
- [ ] Watch Cleaning: `watch-cleaning.jpg`

### Beautician (7)

**Waxing**: folder `catalog-v2/beautician/waxing/`

- [ ] Normal Wax: `normal-wax.jpg`
- [ ] Rica Wax: `rica-wax.jpg`
- [ ] Chocolate Wax: `chocolate-wax.jpg`

**Bridal Packages**: folder `catalog-v2/beautician/bridal-packages/`

- [ ] Pre-Bridal Package: `pre-bridal-package.jpg`
- [ ] Bridal Full Package: `bridal-full-package.jpg`
- [ ] Engagement Package: `engagement-package.jpg`
- [ ] Bridesmaid Makeup: `bridesmaid-makeup.jpg`

### Event & Media Services (109)

**Photography**: folder `catalog-v2/event-media/photography/`

- [ ] Event Photography: `event-photography.jpg`
- [ ] Birthday Photography: `birthday-photography.jpg`
- [ ] Wedding Photography: `wedding-photography.jpg`
- [ ] Pre-Wedding Shoot: `pre-wedding-shoot.jpg`
- [ ] Engagement Photography: `engagement-photography.jpg`
- [ ] Reception Photography: `reception-photography.jpg`
- [ ] Baby Shoot: `baby-shoot.jpg`
- [ ] Kids Photography: `kids-photography.jpg`
- [ ] Maternity Shoot: `maternity-shoot.jpg`
- [ ] Family Shoot: `family-shoot.jpg`
- [ ] Portfolio Shoot: `portfolio-shoot.jpg`
- [ ] Product Photography: `product-photography.jpg`
- [ ] Food Photography: `food-photography.jpg`
- [ ] Real Estate Photography: `real-estate-photography.jpg`
- [ ] Corporate Event Photography: `corporate-event-photography.jpg`
- [ ] Candid Photography: `candid-photography.jpg`
- [ ] Traditional Photography: `traditional-photography.jpg`

**Videography**: folder `catalog-v2/event-media/videography/`

- [ ] Event Videography: `event-videography.jpg`
- [ ] Wedding Videography: `wedding-videography.jpg`
- [ ] Pre-Wedding Video: `pre-wedding-video.jpg`
- [ ] Engagement Video: `engagement-video.jpg`
- [ ] Birthday Videography: `birthday-videography.jpg`
- [ ] Drone Videography: `drone-videography.jpg`
- [ ] Corporate Video Shoot: `corporate-video-shoot.jpg`
- [ ] YouTube Video Shoot: `youtube-video-shoot.jpg`
- [ ] Instagram Reels Shoot: `instagram-reels-shoot.jpg`
- [ ] Short Film Shoot: `short-film-shoot.jpg`
- [ ] Documentary Video: `documentary-video.jpg`
- [ ] Promotional Video: `promotional-video.jpg`
- [ ] Real Estate Video: `real-estate-video.jpg`
- [ ] Product Video Shoot: `product-video-shoot.jpg`
- [ ] Cinematic Video Shoot: `cinematic-video-shoot.jpg`

**Video Editing**: folder `catalog-v2/event-media/video-editing/`

- [ ] Basic Video Editing: `basic-video-editing.jpg`
- [ ] Advanced Editing: `advanced-editing.jpg`
- [ ] Wedding Highlight Video: `wedding-highlight-video.jpg`
- [ ] Full Wedding Film Editing: `full-wedding-film-editing.jpg`
- [ ] Reels Editing: `reels-editing.jpg`
- [ ] YouTube Editing: `youtube-editing.jpg`
- [ ] Color Grading: `color-grading.jpg`
- [ ] Motion Graphics Editing: `motion-graphics-editing.jpg`
- [ ] Subtitle Editing: `subtitle-editing.jpg`
- [ ] Promo Video Editing: `promo-video-editing.jpg`

**Photo Editing**: folder `catalog-v2/event-media/photo-editing/`

- [ ] Basic Photo Editing: `basic-photo-editing.jpg`
- [ ] Advanced Editing: `advanced-editing.jpg`
- [ ] Wedding Album Editing: `wedding-album-editing.jpg`
- [ ] Skin Retouching: `skin-retouching.jpg`
- [ ] Color Correction: `color-correction.jpg`
- [ ] Background Removal: `background-removal.jpg`
- [ ] Photo Enhancement: `photo-enhancement.jpg`
- [ ] AI Photo Restoration: `ai-photo-restoration.jpg`

**Album & Printing**: folder `catalog-v2/event-media/album-printing/`

- [ ] Wedding Album Design: `wedding-album-design.jpg`
- [ ] Birthday Album: `birthday-album.jpg`
- [ ] Premium Album Printing: `premium-album-printing.jpg`
- [ ] Digital Album: `digital-album.jpg`
- [ ] Photo Printing: `photo-printing.jpg`
- [ ] Frame Printing: `frame-printing.jpg`
- [ ] Canvas Printing: `canvas-printing.jpg`
- [ ] Photo Book Design: `photo-book-design.jpg`

**Decoration**: folder `catalog-v2/event-media/decoration/`

- [ ] Site Visit & Consultation: `site-visit-consultation.jpg`
- [ ] Birthday Decoration: `birthday-decoration.jpg`
- [ ] Balloon Decoration: `balloon-decoration.jpg`
- [ ] Wedding Decoration: `wedding-decoration.jpg`
- [ ] Engagement Decoration: `engagement-decoration.jpg`
- [ ] Reception Decoration: `reception-decoration.jpg`
- [ ] Haldi Decoration: `haldi-decoration.jpg`
- [ ] Sangeet Decoration: `sangeet-decoration.jpg`
- [ ] Stage Decoration: `stage-decoration.jpg`
- [ ] Flower Decoration: `flower-decoration.jpg`
- [ ] Theme Decoration: `theme-decoration.jpg`
- [ ] Baby Shower Decoration: `baby-shower-decoration.jpg`
- [ ] Anniversary Decoration: `anniversary-decoration.jpg`
- [ ] Naming Ceremony Decoration: `naming-ceremony-decoration.jpg`
- [ ] Corporate Event Decoration: `corporate-event-decoration.jpg`

**Catering**: folder `catalog-v2/event-media/catering/`

- [ ] Veg Catering: `veg-catering.jpg`
- [ ] Non-Veg Catering: `non-veg-catering.jpg`
- [ ] Buffet Setup: `buffet-setup.jpg`
- [ ] Snacks Catering: `snacks-catering.jpg`
- [ ] Full Meal Catering: `full-meal-catering.jpg`
- [ ] Live Food Counter: `live-food-counter.jpg`
- [ ] Outdoor Catering: `outdoor-catering.jpg`
- [ ] Corporate Catering: `corporate-catering.jpg`

**DJ & Sound**: folder `catalog-v2/event-media/dj-sound/`

- [ ] Site Visit & Consultation: `site-visit-consultation.jpg`
- [ ] DJ Setup: `dj-setup.jpg`
- [ ] Sound System Setup: `sound-system-setup.jpg`
- [ ] Stage Sound Setup: `stage-sound-setup.jpg`
- [ ] Lighting Setup: `lighting-setup.jpg`
- [ ] DJ Lights Setup: `dj-lights-setup.jpg`
- [ ] Smoke Machine Setup: `smoke-machine-setup.jpg`
- [ ] Live Band Setup: `live-band-setup.jpg`
- [ ] LED Wall Setup: `led-wall-setup.jpg`
- [ ] Laser Show Setup: `laser-show-setup.jpg`

**Event Management**: folder `catalog-v2/event-media/event-management/`

- [ ] Event Consultation: `event-consultation.jpg`
- [ ] Full Event Management: `full-event-management.jpg`
- [ ] Wedding Planning: `wedding-planning.jpg`
- [ ] Birthday Planning: `birthday-planning.jpg`
- [ ] Corporate Event Management: `corporate-event-management.jpg`
- [ ] Event Coordination: `event-coordination.jpg`
- [ ] Anchor / Host: `anchor-host.jpg`
- [ ] Celebrity Management: `celebrity-management.jpg`
- [ ] Destination Wedding Planning: `destination-wedding-planning.jpg`

**Entertainment Services**: folder `catalog-v2/event-media/entertainment-services/`

- [ ] Magician Show: `magician-show.jpg`
- [ ] Dance Performance: `dance-performance.jpg`
- [ ] Live Singer: `live-singer.jpg`
- [ ] Anchor / MC: `anchor-mc.jpg`
- [ ] Kids Entertainment: `kids-entertainment.jpg`
- [ ] Fireworks Show: `fireworks-show.jpg`
- [ ] Game Organizer: `game-organizer.jpg`
- [ ] Mimicry Show: `mimicry-show.jpg`
- [ ] Stand-up Comedy: `stand-up-comedy.jpg`

### Rental Services (101)

**Event Furniture Rental**: folder `catalog-v2/rental/event-furniture-rental/`

- [ ] Plastic Chair: `plastic-chair.jpg`
- [ ] Cushion Chair: `cushion-chair.jpg`
- [ ] VIP Sofa Chair: `vip-sofa-chair.jpg`
- [ ] Round Table: `round-table.jpg`
- [ ] Dining Table: `dining-table.jpg`
- [ ] Cocktail Table: `cocktail-table.jpg`
- [ ] Stage Sofa Set: `stage-sofa-set.jpg`
- [ ] Bride/Groom Chair: `bridegroom-chair.jpg`
- [ ] Reception Table: `reception-table.jpg`
- [ ] VIP Lounge Sofa: `vip-lounge-sofa.jpg`
- [ ] Bar Counter: `bar-counter.jpg`

**Tent/Shamiana**: folder `catalog-v2/rental/tentshamiana/`

- [ ] 10x10 ft Tent (10-15 members): `10x10-ft-tent-10-15-members.jpg`
- [ ] 20x20 ft Tent (30-50 members): `20x20-ft-tent-30-50-members.jpg`
- [ ] 30x30 ft Tent (70-100 members): `30x30-ft-tent-70-100-members.jpg`
- [ ] 40x40 ft Tent (120-150 members): `40x40-ft-tent-120-150-members.jpg`
- [ ] 50x50 ft Tent (200-300 members): `50x50-ft-tent-200-300-members.jpg`
- [ ] 60x40 ft Tent (250-400 members): `60x40-ft-tent-250-400-members.jpg`
- [ ] 100x50 ft Tent (500+ members): `100x50-ft-tent-500-members.jpg`
- [ ] Dome Tent: `dome-tent.jpg`
- [ ] Pagoda Tent: `pagoda-tent.jpg`

**Lighting Rental**: folder `catalog-v2/rental/lighting-rental/`

- [ ] LED Lights: `led-lights.jpg`
- [ ] Focus Lights: `focus-lights.jpg`
- [ ] Decorative Lights: `decorative-lights.jpg`
- [ ] Serial Lights: `serial-lights.jpg`
- [ ] Flood Lights: `flood-lights.jpg`
- [ ] Stage Lights: `stage-lights.jpg`
- [ ] Moving Head Lights: `moving-head-lights.jpg`
- [ ] Laser Lights: `laser-lights.jpg`
- [ ] LED Wall: `led-wall.jpg`

**Sound System Rental**: folder `catalog-v2/rental/sound-system-rental/`

- [ ] Small Speaker: `small-speaker.jpg`
- [ ] Large Speaker: `large-speaker.jpg`
- [ ] Line Array System: `line-array-system.jpg`
- [ ] Subwoofer: `subwoofer.jpg`
- [ ] Microphone: `microphone.jpg`
- [ ] Cordless Microphone: `cordless-microphone.jpg`
- [ ] Amplifier: `amplifier.jpg`
- [ ] DJ Setup: `dj-setup.jpg`
- [ ] Mixer System: `mixer-system.jpg`
- [ ] Audio Mixer Console: `audio-mixer-console.jpg`

**Decor Items Rent**: folder `catalog-v2/rental/decor-items-rent/`

- [ ] Balloon Kit: `balloon-kit.jpg`
- [ ] Theme Props: `theme-props.jpg`
- [ ] Photo Booth Setup: `photo-booth-setup.jpg`
- [ ] Cutouts: `cutouts.jpg`
- [ ] Flower Panels: `flower-panels.jpg`
- [ ] Entry Gate Setup: `entry-gate-setup.jpg`
- [ ] Selfie Point Setup: `selfie-point-setup.jpg`
- [ ] LED Name Board: `led-name-board.jpg`
- [ ] Red Carpet: `red-carpet.jpg`

**Catering Equipment**: folder `catalog-v2/rental/catering-equipment/`

- [ ] Cooking Vessels: `cooking-vessels.jpg`
- [ ] Serving Dishes: `serving-dishes.jpg`
- [ ] Buffet Tables: `buffet-tables.jpg`
- [ ] Plates & Glasses: `plates-glasses.jpg`
- [ ] Water Dispenser: `water-dispenser.jpg`
- [ ] Gas Stove: `gas-stove.jpg`
- [ ] Deep Freezer: `deep-freezer.jpg`
- [ ] Tea/Coffee Counter Setup: `teacoffee-counter-setup.jpg`

**Construction Equipment**: folder `catalog-v2/rental/construction-equipment/`

- [ ] Concrete Mixer: `concrete-mixer.jpg`
- [ ] Vibrator Machine: `vibrator-machine.jpg`
- [ ] Scaffolding: `scaffolding.jpg`
- [ ] Centering Material: `centering-material.jpg`
- [ ] JCB / Excavator: `jcb-excavator.jpg`
- [ ] Drilling Machine: `drilling-machine.jpg`
- [ ] Power Trowel: `power-trowel.jpg`
- [ ] Diesel Generator: `diesel-generator.jpg`

**Home Appliance Rental**: folder `catalog-v2/rental/home-appliance-rental/`

- [ ] Refrigerator: `refrigerator.jpg`
- [ ] Washing Machine: `washing-machine.jpg`
- [ ] TV: `tv.jpg`
- [ ] AC: `ac.jpg`
- [ ] Air Cooler: `air-cooler.jpg`
- [ ] Water Purifier: `water-purifier.jpg`
- [ ] Microwave Oven: `microwave-oven.jpg`

**Furniture Rental (Home/Office)**: folder `catalog-v2/rental/furniture-rental-homeoffice/`

- [ ] Sofa: `sofa.jpg`
- [ ] Bed: `bed.jpg`
- [ ] Mattress: `mattress.jpg`
- [ ] Wardrobe: `wardrobe.jpg`
- [ ] Office Chair: `office-chair.jpg`
- [ ] Office Table: `office-table.jpg`
- [ ] Study Table: `study-table.jpg`
- [ ] Workstation: `workstation.jpg`

**Camera & Media Equipment**: folder `catalog-v2/rental/camera-media-equipment/`

- [ ] DSLR Camera: `dslr-camera.jpg`
- [ ] Lens: `lens.jpg`
- [ ] Video Camera: `video-camera.jpg`
- [ ] Tripod: `tripod.jpg`
- [ ] Gimbal: `gimbal.jpg`
- [ ] Drone Camera: `drone-camera.jpg`
- [ ] Action Camera: `action-camera.jpg`
- [ ] LED Video Light: `led-video-light.jpg`

**Tools & Machinery**: folder `catalog-v2/rental/tools-machinery/`

- [ ] Drill Machine: `drill-machine.jpg`
- [ ] Cutter Machine: `cutter-machine.jpg`
- [ ] Grinder: `grinder.jpg`
- [ ] Welding Machine: `welding-machine.jpg`
- [ ] Power Tools Kit: `power-tools-kit.jpg`
- [ ] Air Compressor: `air-compressor.jpg`
- [ ] Pressure Washer: `pressure-washer.jpg`
- [ ] Ladder: `ladder.jpg`

**Cooling/Heating**: folder `catalog-v2/rental/coolingheating/`

- [ ] Air Cooler: `air-cooler.jpg`
- [ ] AC Rental: `ac-rental.jpg`
- [ ] Industrial Fan: `industrial-fan.jpg`
- [ ] Heater: `heater.jpg`
- [ ] Air Blower: `air-blower.jpg`
- [ ] Mist Fan: `mist-fan.jpg`

### Vehicle Services (133)

**Ride Booking**: folder `catalog-v2/vehicle/ride-booking/`

- [ ] Bike Ride: `bike-ride.jpg`
- [ ] Auto Ride: `auto-ride.jpg`
- [ ] Taxi Ride: `taxi-ride.jpg`
- [ ] Premium Cab Ride: `premium-cab-ride.jpg`
- [ ] EV Ride: `ev-ride.jpg`

**Taxi Services**: folder `catalog-v2/vehicle/taxi-services/`

- [ ] Local Taxi: `local-taxi.jpg`
- [ ] Airport Pickup Taxi: `airport-pickup-taxi.jpg`
- [ ] Airport Drop Taxi: `airport-drop-taxi.jpg`
- [ ] Outstation One Way Taxi: `outstation-one-way-taxi.jpg`
- [ ] Outstation Round Trip Taxi: `outstation-round-trip-taxi.jpg`
- [ ] Hourly Taxi Booking: `hourly-taxi-booking.jpg`
- [ ] Full Day Taxi Booking: `full-day-taxi-booking.jpg`
- [ ] Premium Taxi: `premium-taxi.jpg`
- [ ] SUV Taxi: `suv-taxi.jpg`
- [ ] Innova Taxi: `innova-taxi.jpg`
- [ ] Tempo Traveller Taxi: `tempo-traveller-taxi.jpg`
- [ ] Corporate Taxi: `corporate-taxi.jpg`
- [ ] Wedding Guest Transportation: `wedding-guest-transportation.jpg`

**Goods & Transportation**: folder `catalog-v2/vehicle/goods-transportation/`

- [ ] Tata Ace Booking: `tata-ace-booking.jpg`
- [ ] Pickup Vehicle Booking: `pickup-vehicle-booking.jpg`
- [ ] Mini Truck Booking: `mini-truck-booking.jpg`
- [ ] Truck Booking: `truck-booking.jpg`
- [ ] Tempo Traveller Transport: `tempo-traveller-transport.jpg`
- [ ] Bus Transport: `bus-transport.jpg`
- [ ] Water Tanker Booking: `water-tanker-booking.jpg`
- [ ] House Shifting: `house-shifting.jpg`
- [ ] Office Shifting: `office-shifting.jpg`
- [ ] Material Transport: `material-transport.jpg`
- [ ] Furniture Transport: `furniture-transport.jpg`
- [ ] Machinery Transport: `machinery-transport.jpg`
- [ ] Construction Material Transport: `construction-material-transport.jpg`

**Instant Delivery**: folder `catalog-v2/vehicle/instant-delivery/`

- [ ] Parcel Delivery: `parcel-delivery.jpg`
- [ ] Document Delivery: `document-delivery.jpg`
- [ ] Medicine Delivery: `medicine-delivery.jpg`
- [ ] Grocery Delivery: `grocery-delivery.jpg`
- [ ] Food Delivery: `food-delivery.jpg`
- [ ] Flower Delivery: `flower-delivery.jpg`
- [ ] Fruits Delivery: `fruits-delivery.jpg`
- [ ] Vegetables Delivery: `vegetables-delivery.jpg`
- [ ] Water Can Delivery: `water-can-delivery.jpg`
- [ ] Milk Delivery: `milk-delivery.jpg`
- [ ] Small Package Delivery: `small-package-delivery.jpg`

**Vehicle Washing & Cleaning**: folder `catalog-v2/vehicle/vehicle-washing-cleaning/`

- [ ] Bike Wash: `bike-wash.jpg`
- [ ] Car Wash: `car-wash.jpg`
- [ ] Foam Wash: `foam-wash.jpg`
- [ ] Interior Cleaning: `interior-cleaning.jpg`
- [ ] Exterior Cleaning: `exterior-cleaning.jpg`
- [ ] Vacuum Cleaning: `vacuum-cleaning.jpg`
- [ ] Engine Bay Cleaning: `engine-bay-cleaning.jpg`
- [ ] Headlight Restoration: `headlight-restoration.jpg`
- [ ] Polishing: `polishing.jpg`
- [ ] Detailing: `detailing.jpg`
- [ ] Ceramic Coating: `ceramic-coating.jpg`
- [ ] Teflon Coating: `teflon-coating.jpg`

**Vehicle Servicing**: folder `catalog-v2/vehicle/vehicle-servicing/`

- [ ] Basic Inspection: `basic-inspection.jpg`
- [ ] Bike Service: `bike-service.jpg`
- [ ] Car Service: `car-service.jpg`
- [ ] EV Service: `ev-service.jpg`
- [ ] Commercial Vehicle Service: `commercial-vehicle-service.jpg`
- [ ] Periodic Service: `periodic-service.jpg`
- [ ] Engine Oil Change: `engine-oil-change.jpg`
- [ ] Filter Replacement: `filter-replacement.jpg`
- [ ] AC Service: `ac-service.jpg`
- [ ] Battery Checkup: `battery-checkup.jpg`
- [ ] Wheel Alignment: `wheel-alignment.jpg`
- [ ] Wheel Balancing: `wheel-balancing.jpg`
- [ ] Full Vehicle Checkup: `full-vehicle-checkup.jpg`

**Vehicle Repair Services**: folder `catalog-v2/vehicle/vehicle-repair-services/`

- [ ] Engine Repair: `engine-repair.jpg`
- [ ] Clutch Repair: `clutch-repair.jpg`
- [ ] Brake Repair: `brake-repair.jpg`
- [ ] Suspension Repair: `suspension-repair.jpg`
- [ ] Electrical Repair: `electrical-repair.jpg`
- [ ] Starter Repair: `starter-repair.jpg`
- [ ] Alternator Repair: `alternator-repair.jpg`
- [ ] Radiator Repair: `radiator-repair.jpg`
- [ ] Battery Repair: `battery-repair.jpg`
- [ ] AC Repair: `ac-repair.jpg`
- [ ] Gearbox Repair: `gearbox-repair.jpg`
- [ ] Silencer Repair: `silencer-repair.jpg`
- [ ] Fuel System Repair: `fuel-system-repair.jpg`
- [ ] Denting & Painting: `denting-painting.jpg`
- [ ] Windshield Repair: `windshield-repair.jpg`

**Roadside Assistance**: folder `catalog-v2/vehicle/roadside-assistance/`

- [ ] Breakdown Assistance: `breakdown-assistance.jpg`
- [ ] Emergency Repair: `emergency-repair.jpg`
- [ ] On-Site Inspection: `on-site-inspection.jpg`
- [ ] Battery Jump Start: `battery-jump-start.jpg`
- [ ] Battery Replacement: `battery-replacement.jpg`
- [ ] Battery Charging: `battery-charging.jpg`
- [ ] Puncture Repair: `puncture-repair.jpg`
- [ ] Tyre Replacement: `tyre-replacement.jpg`
- [ ] Wheel Alignment: `wheel-alignment.jpg`
- [ ] Wheel Balancing: `wheel-balancing.jpg`
- [ ] Emergency Fuel Delivery: `emergency-fuel-delivery.jpg`
- [ ] Wrong Fuel Assistance: `wrong-fuel-assistance.jpg`
- [ ] Key Unlock Service: `key-unlock-service.jpg`
- [ ] Lost Key Assistance: `lost-key-assistance.jpg`
- [ ] Duplicate Key Service: `duplicate-key-service.jpg`
- [ ] Local Towing: `local-towing.jpg`
- [ ] Long Distance Towing: `long-distance-towing.jpg`
- [ ] Flatbed Towing: `flatbed-towing.jpg`
- [ ] Accident Recovery: `accident-recovery.jpg`

**Vehicle Rental Services**: folder `catalog-v2/vehicle/vehicle-rental-services/`

- [ ] Bike Rental: `bike-rental.jpg`
- [ ] Scooter Rental: `scooter-rental.jpg`
- [ ] Auto Rental: `auto-rental.jpg`
- [ ] Car Rental (Self Drive): `car-rental-self-drive.jpg`
- [ ] Car Rental (With Driver): `car-rental-with-driver.jpg`
- [ ] Luxury Car Rental: `luxury-car-rental.jpg`
- [ ] Wedding Car Rental: `wedding-car-rental.jpg`
- [ ] EV Vehicle Rental: `ev-vehicle-rental.jpg`
- [ ] Van Rental: `van-rental.jpg`
- [ ] Tempo Traveller Rental: `tempo-traveller-rental.jpg`
- [ ] Mini Bus Rental: `mini-bus-rental.jpg`
- [ ] Bus Rental: `bus-rental.jpg`
- [ ] Truck Rental: `truck-rental.jpg`
- [ ] Pickup Vehicle Rental: `pickup-vehicle-rental.jpg`
- [ ] Water Tanker Rental: `water-tanker-rental.jpg`

**EV Services**: folder `catalog-v2/vehicle/ev-services/`

- [ ] Battery Health Check: `battery-health-check.jpg`
- [ ] Charging System Check: `charging-system-check.jpg`
- [ ] Motor Inspection: `motor-inspection.jpg`
- [ ] Controller Diagnostics: `controller-diagnostics.jpg`
- [ ] Mobile Charging Support: `mobile-charging-support.jpg`
- [ ] Battery Assistance: `battery-assistance.jpg`
- [ ] EV Towing: `ev-towing.jpg`
- [ ] EV Charger Installation: `ev-charger-installation.jpg`

**Vehicle Documents & Insurance**: folder `catalog-v2/vehicle/vehicle-documents-insurance/`

- [ ] New Insurance: `new-insurance.jpg`
- [ ] Insurance Renewal: `insurance-renewal.jpg`
- [ ] Claim Assistance: `claim-assistance.jpg`
- [ ] RC Transfer: `rc-transfer.jpg`
- [ ] Fitness Certificate: `fitness-certificate.jpg`
- [ ] Pollution Certificate: `pollution-certificate.jpg`
- [ ] Permit Renewal: `permit-renewal.jpg`
- [ ] Loan Closure Assistance: `loan-closure-assistance.jpg`
- [ ] Challan Assistance: `challan-assistance.jpg`

### Man Power & Support Staff (50)

**Cleaning & Maintenance Staff**: folder `catalog-v2/manpower/cleaning-maintenance-staff/`

- [ ] Housekeeping Staff: `housekeeping-staff.jpg`
- [ ] Office Cleaning Staff: `office-cleaning-staff.jpg`
- [ ] Janitors: `janitors.jpg`
- [ ] Deep Cleaning Teams: `deep-cleaning-teams.jpg`
- [ ] Maintenance Workers: `maintenance-workers.jpg`
- [ ] Pest Control Helpers: `pest-control-helpers.jpg`

**Logistics & Handling**: folder `catalog-v2/manpower/logistics-handling/`

- [ ] Loading Staff: `loading-staff.jpg`
- [ ] Unloading Staff: `unloading-staff.jpg`
- [ ] Packers & Movers Staff: `packers-movers-staff.jpg`
- [ ] Delivery Helpers: `delivery-helpers.jpg`
- [ ] Warehouse Helpers: `warehouse-helpers.jpg`
- [ ] Material Handling Staff: `material-handling-staff.jpg`

**Event & Catering Staff**: folder `catalog-v2/manpower/event-catering-staff/`

- [ ] Catering Boys: `catering-boys.jpg`
- [ ] Catering Girls: `catering-girls.jpg`
- [ ] Waiters: `waiters.jpg`
- [ ] Kitchen Helpers: `kitchen-helpers.jpg`
- [ ] Event Setup Staff: `event-setup-staff.jpg`
- [ ] Serving Staff: `serving-staff.jpg`
- [ ] Decoration Helpers: `decoration-helpers.jpg`

**Drivers & Transport Staff**: folder `catalog-v2/manpower/drivers-transport-staff/`

- [ ] Car Drivers: `car-drivers.jpg`
- [ ] Truck Drivers: `truck-drivers.jpg`
- [ ] Tempo Drivers: `tempo-drivers.jpg`
- [ ] Bus Drivers: `bus-drivers.jpg`
- [ ] Temporary Drivers: `temporary-drivers.jpg`
- [ ] Permanent Drivers: `permanent-drivers.jpg`

**Office Support Staff**: folder `catalog-v2/manpower/office-support-staff/`

- [ ] Office Boys: `office-boys.jpg`
- [ ] Office Assistants: `office-assistants.jpg`
- [ ] Data Entry Operators: `data-entry-operators.jpg`
- [ ] Receptionists: `receptionists.jpg`
- [ ] File Management Staff: `file-management-staff.jpg`
- [ ] Front Office Staff: `front-office-staff.jpg`

**Domestic Staff**: folder `catalog-v2/manpower/domestic-staff/`

- [ ] Maids: `maids.jpg`
- [ ] Cooks: `cooks.jpg`
- [ ] Babysitters: `babysitters.jpg`
- [ ] Elder Care Staff: `elder-care-staff.jpg`
- [ ] House Helpers: `house-helpers.jpg`
- [ ] Patient Care Attendants: `patient-care-attendants.jpg`

**Security Staff**: folder `catalog-v2/manpower/security-staff/`

- [ ] Security Guards: `security-guards.jpg`
- [ ] Bouncers: `bouncers.jpg`
- [ ] Watchmen: `watchmen.jpg`
- [ ] Gate Security Staff: `gate-security-staff.jpg`
- [ ] Event Security Staff: `event-security-staff.jpg`

**Retail Support Staff**: folder `catalog-v2/manpower/retail-support-staff/`

- [ ] Sales Boys: `sales-boys.jpg`
- [ ] Sales Girls: `sales-girls.jpg`
- [ ] Store Helpers: `store-helpers.jpg`
- [ ] Cash Counter Assistants: `cash-counter-assistants.jpg`

**Industrial Support Staff**: folder `catalog-v2/manpower/industrial-support-staff/`

- [ ] Factory Helpers: `factory-helpers.jpg`
- [ ] Packing Staff: `packing-staff.jpg`
- [ ] Assembly Line Helpers: `assembly-line-helpers.jpg`
- [ ] Production Helpers: `production-helpers.jpg`

### Home Services (24)

**Borewell Services**: folder `catalog-v2/home-services/borewell-services/`

- [ ] Borewell Cleaning: `borewell-cleaning.jpg`
- [ ] Borewell Repair: `borewell-repair.jpg`
- [ ] Borewell Motor Installation: `borewell-motor-installation.jpg`

**Home Shifting**: folder `catalog-v2/home-services/home-shifting/`

- [ ] House Shifting: `house-shifting.jpg`
- [ ] Packing Service: `packing-service.jpg`
- [ ] Unpacking Service: `unpacking-service.jpg`
- [ ] Loading & Unloading: `loading-unloading.jpg`
- [ ] Furniture Shifting: `furniture-shifting.jpg`
- [ ] Office Shifting: `office-shifting.jpg`

**Storage Services**: folder `catalog-v2/home-services/storage-services/`

- [ ] Household Storage: `household-storage.jpg`
- [ ] Office Storage: `office-storage.jpg`
- [ ] Warehouse Storage: `warehouse-storage.jpg`

**Elder Care**: folder `catalog-v2/home-services/elder-care/`

- [ ] Elder Care Attendant: `elder-care-attendant.jpg`
- [ ] Companion Care: `companion-care.jpg`
- [ ] Bedridden Patient Care: `bedridden-patient-care.jpg`
- [ ] Babysitter: `babysitter.jpg`
- [ ] Newborn Care: `newborn-care.jpg`
- [ ] Nanny Service: `nanny-service.jpg`

**Maid Services**: folder `catalog-v2/home-services/maid-services/`

- [ ] Full Time Maid: `full-time-maid.jpg`
- [ ] Part Time Maid: `part-time-maid.jpg`
- [ ] Cook: `cook.jpg`
- [ ] Housekeeping: `housekeeping.jpg`
- [ ] Live-in Maid: `live-in-maid.jpg`

**Home Maintenance**: folder `catalog-v2/home-services/home-maintenance/`

- [ ] Annual Home Maintenance Contract (AMC): `annual-home-maintenance-contract-amc.jpg`

### Pet Services (17)

**Pet Grooming**: folder `catalog-v2/pet-services/pet-grooming/`

- [ ] Bath & Spa: `bath-spa.jpg`
- [ ] Hair Trimming: `hair-trimming.jpg`
- [ ] Nail Clipping: `nail-clipping.jpg`
- [ ] Ear Cleaning: `ear-cleaning.jpg`
- [ ] Teeth Cleaning: `teeth-cleaning.jpg`

**Veterinary**: folder `catalog-v2/pet-services/veterinary/`

- [ ] Emergency Vet: `emergency-vet.jpg`

**Pet Boarding**: folder `catalog-v2/pet-services/pet-boarding/`

- [ ] Dog Boarding: `dog-boarding.jpg`
- [ ] Cat Boarding: `cat-boarding.jpg`
- [ ] Day Care: `day-care.jpg`

**Pet Taxi**: folder `catalog-v2/pet-services/pet-taxi/`

- [ ] Pet Pickup & Drop: `pet-pickup-drop.jpg`

**Pet Adoption**: folder `catalog-v2/pet-services/pet-adoption/`

- [ ] Dog Adoption: `dog-adoption.jpg`
- [ ] Cat Adoption: `cat-adoption.jpg`

**Pet Shop**: folder `catalog-v2/pet-services/pet-shop/`

- [ ] Pet Food: `pet-food.jpg`
- [ ] Pet Accessories: `pet-accessories.jpg`
- [ ] Pet Toys: `pet-toys.jpg`
- [ ] Pet Medicines: `pet-medicines.jpg`

**Pet Insurance**: folder `catalog-v2/pet-services/pet-insurance/`

- [ ] Pet Insurance Assistance: `pet-insurance-assistance.jpg`
