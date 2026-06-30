# VSolveHub — BRD Summary

> **Source:** QuickServiceHub_BRD_v1.9 | **Condensed for PRD reference**  
> **Client:** VSolveHub | [vsolvehubofficial@gmail.com](mailto:vsolvehubofficial@gmail.com)  
> **Website:** [www.vsolvehub.com](http://www.vsolvehub.com)

---

## 1. Project Overview

**VSolveHub** is a technology-enabled service coordination platform that connects customers with trusted workers, technicians, and service providers across Tier 2/3 Indian cities. The platform delivers 'all services at your doorstep' — covering manpower, skilled technicians, event services, equipment rentals, and job opportunities under one roof.

**Delivery Model:** Fixed-Price, Milestone-Based  
**Duration:** 3 Months (12 Weeks)  
**Prepared by:** WebAura / VSolveHub Development Team  

---

## 2. Business Objectives

1. Establish a professional, credible online presence for VSolveHub
2. Enable customers to discover, browse, and request services online 24×7
3. Provide a job portal for workers and service providers to register and find work
4. Digitise lead management — capture, track, and respond to service enquiries efficiently
5. Showcase all service categories in a visually appealing, multilingual-ready interface
6. Build a scalable platform that can accommodate future service additions

---

## 3. In-Scope Service Modules


| #   | Module               | Key Features                                                                                                          | Status            |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | Construction Labour  | Mason, Helper, Painting, Carpentry, Bar Bending, Shuttering, Site Support, Demolition — listing, filtering, booking   | ✅ In Scope        |
| 2   | Technician Services  | Electrician, Plumber, AC Technician, RO & Appliance Repair, CCTV, PC & Laptop — profile listing & service request     | ✅ In Scope        |
| 3   | Manpower & Support   | Office Cleaning, Loading/Unloading, Office Boys, Drivers (Temp/Permanent), Catering — staffing request forms          | ✅ In Scope        |
| 4   | Beautician & Wedding | Bridal & Party Makeup, Haircut & Styling, Facial & Skincare, Wedding Helpers — home service booking                   | ✅ In Scope        |
| 5   | Events & Media       | Weddings, Birthday Events, Photography & Videography, Stage/Sound/Lighting, Decoration — event enquiry                | ✅ In Scope        |
| 6   | Equipment Rental     | Stage Setup, Sound Systems, Microphones, LED Screening, Lights, Chairs, Tables, Shamiana, Generators — rental request | ✅ In Scope        |
| 7   | Vehicle Services     | Auto Services & Tractor Services ONLY                                                                                 | ✅ In Scope        |
| 8   | More Services & Jobs | Watchmen, Sales Staff, Office Boys, Housekeeping, PG/Hostel Support, Custom Manpower                                  | ✅ In Scope        |
| —   | Bike Services        | Add-on module                                                                                                         | ⚠️ Package B only |
| —   | Local Transport      | Add-on module                                                                                                         | ⚠️ Package B only |


> **Note:** Bike Services and Local Transport are explicitly excluded from Phase 1 (Package A). Available as Package B add-on.

---

## 4. Platform Modules Summary

### A. Public-Facing Web Application


| Page                | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| Home Page           | Hero banner, services overview, CTAs, testimonials, contact strip         |
| Service Listing     | Dedicated page per category with descriptions, sub-services, booking form |
| Job Opportunities   | Worker registration form, job listings                                    |
| About Us            | Company story, vision, mission, team                                      |
| Contact Us          | Enquiry form, WhatsApp link, map embed, phone/email                       |
| Gallery / Portfolio | Event and work photos                                                     |
| FAQ                 | Common questions per service category                                     |


### B. Admin Panel


| Module                  | Purpose                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard               | Summary of leads, enquiries, worker registrations                                                                                                         |
| Service Management      | Add/edit/delete service categories and sub-services                                                                                                       |
| Lead Management         | View, filter, update status of customer enquiries                                                                                                         |
| Worker Management       | View and manage worker profiles, verification queue; DigiLocker-verified workers display a government-verified badge and require no document image review |
| Content Management      | Update banners, images, text                                                                                                                              |
| Notification Management | Configure WhatsApp/email notification templates                                                                                                           |


### C. Mobile Applications (Flutter — Android + iOS)

**Customer App:**

- Service browsing across all categories
- Booking & enquiry with date/location
- Real-time order tracking
- Push notifications (FCM)
- User profile & history
- WhatsApp quick connect

**Worker / Rider App:**

- Job alerts (real-time push)
- Booking acceptance & management (30-second timer)
- Status updates (On the Way → In Progress → Completed)
- Earnings dashboard
- Worker profile management
- **Rapido-style verification gate:** registration → DigiLocker Aadhaar verification (or manual upload fallback) → selfie + skills submission → admin approval → activation

---

## 5. Key Functional Requirements

### 5.1 Service Enquiry & Booking Flow

1. Customer navigates to a service category
2. Fills service enquiry form (name, phone, location, service type, date)
3. Receives automated WhatsApp/email confirmation
4. Admin receives notification and follows up with customer

### 5.2 Worker / Job Applicant Registration Flow

1. Worker fills registration form (name, skills, experience, location, contact)
2. Profile stored in admin panel for shortlisting
3. Candidate shortlisting and interview scheduling by VSolveHub team
4. (App Flow) Document upload → admin verification → approval → activation

### 5.3 Equipment Rental Enquiry Flow

1. Customer selects equipment type, event date, quantity required
2. Rental enquiry logged in admin dashboard
3. Admin follows up to confirm availability and pricing

---

## 6. Non-Functional Requirements Summary


| Requirement   | Target                                                            |
| ------------- | ----------------------------------------------------------------- |
| Performance   | Pages load within 3 seconds on standard 4G connection             |
| Security      | SSL certificate, form input validation, reCAPTCHA spam protection |
| Scalability   | Architecture supports future service category additions           |
| Compatibility | Chrome, Firefox, Safari, Edge — latest 2 versions; iOS + Android  |
| Accessibility | WCAG AA compliance for colour contrast and alt-text               |


---

## 7. Technology Stack (from BRD)


| Component       | Technology                                                |
| --------------- | --------------------------------------------------------- |
| Front-End       | React.js (v18+) / Next.js 14+ (App Router) — TypeScript   |
| Back-End        | Django 5 (Python) with Django REST Framework              |
| Database        | PostgreSQL 16                                             |
| Admin Panel     | Custom-built responsive admin dashboard                   |
| Mobile          | Flutter 3.x / Dart 3 (Customer App + Worker/Rider App)    |
| Hosting         | Cloud VPS (AWS / DigitalOcean / cPanel Hosting)           |
| Version Control | Git / GitHub                                              |
| Notifications   | Twilio / WATI (WhatsApp API) + Email SMTP                 |
| Identity & KYC  | DigiLocker Partner API (Aadhaar verification for workers) |
| Analytics       | Google Analytics 4                                        |
| SEO             | On-page SEO, sitemap, robots.txt, schema markup           |


---

## 8. Package Pricing Reference

### Package A — Website + Apps (Without Vehicle Module)

**Total: ₹5,40,000 + Server Costs**


| Component                                                | Cost                   |
| -------------------------------------------------------- | ---------------------- |
| Website Development (all services excl. vehicle add-on)  | ₹2,40,000              |
| Mobile App Development (Customer App + Worker/Rider App) | ₹3,00,000 + Server     |
| **TOTAL**                                                | **₹5,40,000 + Server** |


### Package B — Website + Apps + Vehicle Module

**Total: ₹9,90,000 + Server Costs**


| Component                                        | Cost                   |
| ------------------------------------------------ | ---------------------- |
| Website Development                              | ₹2,40,000              |
| Mobile App Development (Customer + Worker)       | ₹2,70,000              |
| Vehicle Add-on (Bike Services + Local Transport) | ₹4,50,000              |
| **TOTAL**                                        | **₹9,90,000 + Server** |


### Payment Schedule


| Instalment   | When                                 | %   |
| ------------ | ------------------------------------ | --- |
| Instalment 1 | On sign-off before work begins       | 50% |
| Instalment 2 | End of Month 2 (back-end completion) | 20% |
| Instalment 3 | Final delivery & go-live             | 30% |


### Monthly Maintenance Package


| Package                                                             | Cost           |
| ------------------------------------------------------------------- | -------------- |
| Monthly Maintenance & Support (Website + Customer App + Worker App) | ₹8,000 / month |


**Includes:** Bug fixes, security updates, performance monitoring, content updates (5 changes/month), app store compliance, DB backups, priority support (24hr response).

### Estimated Recurring Operational Costs


| Service                     | Provider            | Estimated Monthly Cost |
| --------------------------- | ------------------- | ---------------------- |
| Cloud Server (VPS)          | AWS / DigitalOcean  | ₹1,500–₹4,000          |
| WhatsApp Business API       | WATI / Twilio       | ₹800–₹3,000            |
| SMS / OTP                   | Twilio / MSG91      | ₹150–₹400              |
| Push Notifications (FCM)    | Firebase            | ₹0 (up to 500K/month)  |
| Email SMTP                  | SendGrid / Mailgun  | ₹0–₹800                |
| SSL Certificate             | Let's Encrypt       | ₹0                     |
| Domain Name                 | GoDaddy / Namecheap | ₹800–₹1,500/year       |
| Google Play Store           | Google              | USD $25 one-time       |
| Apple App Store             | Apple               | USD $99/year           |
| Google Maps API             | Google Cloud        | ₹0–₹2,000              |
| **Estimated Monthly Total** |                     | **₹3,000–₹10,000**     |


---

## 9. Client Responsibilities

- ✅ Provide brand assets: logo (high-res), brand colours, existing photos/videos
- ✅ Supply all text content in English for each service category
- ✅ Provide WhatsApp numbers and email IDs for notification setup
- ✅ Timely review and approval of design mockups (within 2 business days)
- ✅ Designate a single point of contact (SPOC) for the project
- ✅ Arrange domain, hosting, and WhatsApp API credentials
- ✅ Provide consolidated, written feedback to avoid delays

---

## 10. Assumptions & Dependencies

- Client provides all content and assets by Phase 1 completion (end of Week 2)
- Any delay in client-side approvals may extend timeline proportionally
- WhatsApp API account (WATI/Twilio) set up by client or budgeted separately
- Cloud server procured and accessible before Month 2 development begins
- Project scope is fixed; changes after design sign-off attract additional charges
- Browser/device testing covers latest 2 versions of major browsers

---

## 11. What Is NOT Included (Phase 1)

- ❌ Domain registration and annual hosting charges (client responsibility)
- ❌ WhatsApp API subscription fees (third-party cost)
- ❌ Content creation — text copywriting, professional photography
- ❌ Multilingual content entry (Telugu/Hindi) — design supports it; content by client
- ❌ Paid advertising or digital marketing campaigns
- ❌ Vehicle module add-on (Bike Services & Local Transport) — Package B only
- ❌ Future feature additions beyond current scope (quoted separately)

