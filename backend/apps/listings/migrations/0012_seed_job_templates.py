"""Starter job templates: common local jobs with the skills and duties they usually need.

Role names are neutral (no "Sales Girl / Sales Boy"); an employer can still add a preference in
the description. Operations can edit or add templates afterwards.
"""

from django.db import migrations

# (category, role, skills, duties, job_type, shift, work_mode, min ₹, max ₹)
TEMPLATES = [
    # Retail & Sales
    ("Retail & Sales", "Sales Executive", ["Sales", "Customer handling", "Communication", "Product knowledge", "Billing"], ["Greet and help customers", "Explain products", "Close sales", "Keep the display neat"], "FULL_TIME", "DAY", "ON_SITE", 15000, 25000),
    ("Retail & Sales", "Jewellery Sales Executive", ["Jewellery sales", "Customer handling", "Gold & silver knowledge", "Communication", "Billing"], ["Show and explain jewellery", "Handle customer queries", "Support billing", "Maintain stock records"], "FULL_TIME", "DAY", "ON_SITE", 20000, 35000),
    ("Retail & Sales", "Cashier / Billing Executive", ["Billing", "POS", "Cash handling", "Basic computer", "Customer handling"], ["Bill customers", "Handle cash and UPI", "Tally the counter daily", "Issue receipts"], "FULL_TIME", "DAY", "ON_SITE", 12000, 20000),
    ("Retail & Sales", "Store Manager", ["Team handling", "Sales", "Inventory", "Customer handling", "Reporting"], ["Run daily store operations", "Manage staff", "Track stock and sales", "Handle escalations"], "FULL_TIME", "DAY", "ON_SITE", 25000, 45000),
    ("Retail & Sales", "Shop Assistant / Helper", ["Customer handling", "Stock arrangement", "Packing", "Physical work"], ["Arrange stock", "Help customers", "Pack orders", "Keep the shop clean"], "FULL_TIME", "DAY", "ON_SITE", 10000, 15000),
    # Office & Administration
    ("Office & Administration", "Office Assistant", ["MS Office", "Communication", "Filing", "Basic computer"], ["Handle files and records", "Manage office supplies", "Coordinate meetings", "Support the team"], "FULL_TIME", "DAY", "ON_SITE", 12000, 20000),
    ("Office & Administration", "Receptionist", ["Communication", "Phone handling", "Customer handling", "Basic computer"], ["Greet visitors", "Answer calls", "Keep the visitor register", "Schedule appointments"], "FULL_TIME", "DAY", "ON_SITE", 12000, 20000),
    ("Office & Administration", "Data Entry Operator", ["Typing", "Excel", "Basic computer", "Accuracy"], ["Enter data accurately", "Update records", "Prepare simple reports"], "FULL_TIME", "DAY", "ON_SITE", 10000, 18000),
    ("Office & Administration", "Back Office Executive", ["MS Office", "Excel", "Email", "Documentation"], ["Process documents", "Maintain records", "Coordinate with other teams"], "FULL_TIME", "DAY", "ON_SITE", 12000, 22000),
    ("Office & Administration", "Office Boy / Peon", ["Physical work", "Punctuality", "Cleaning"], ["Serve tea and water", "Deliver files", "Keep the office clean"], "FULL_TIME", "DAY", "ON_SITE", 9000, 13000),
    # Healthcare
    ("Healthcare", "Staff Nurse", ["Patient care", "Medication", "Vital signs", "First aid"], ["Care for patients", "Give medicines as prescribed", "Record vitals", "Assist doctors"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 15000, 30000),
    ("Healthcare", "Pharmacist", ["Medicine knowledge", "Billing", "Prescription reading", "Inventory"], ["Dispense medicines", "Check prescriptions", "Manage stock and expiry"], "FULL_TIME", "DAY", "ON_SITE", 15000, 28000),
    ("Healthcare", "Lab Technician", ["Sample collection", "Lab equipment", "Reporting", "Hygiene"], ["Collect samples", "Run tests", "Prepare reports"], "FULL_TIME", "DAY", "ON_SITE", 13000, 25000),
    ("Healthcare", "Hospital Receptionist", ["Communication", "Billing", "Appointment booking", "Basic computer"], ["Register patients", "Book appointments", "Handle billing queries"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 12000, 20000),
    ("Healthcare", "Ward Assistant", ["Patient care", "Hygiene", "Physical work"], ["Help patients move", "Keep wards clean", "Support nurses"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 10000, 15000),
    # Driver & Delivery
    ("Driver & Delivery", "Car Driver", ["Driving licence", "Route knowledge", "Safe driving", "Punctuality"], ["Drive safely", "Keep the vehicle clean", "Maintain trip records"], "FULL_TIME", "DAY", "FIELD", 15000, 22000),
    ("Driver & Delivery", "Delivery Executive", ["Two-wheeler", "Driving licence", "Route knowledge", "Smartphone use"], ["Deliver orders on time", "Collect payments", "Update delivery status in the app"], "FULL_TIME", "FLEXIBLE", "FIELD", 15000, 25000),
    ("Driver & Delivery", "Heavy Vehicle Driver", ["Heavy licence", "Long-distance driving", "Vehicle checks"], ["Drive trucks or buses", "Check the vehicle daily", "Keep trip papers"], "FULL_TIME", "ROTATIONAL", "FIELD", 20000, 30000),
    ("Driver & Delivery", "Auto / Cab Driver", ["Driving licence", "Route knowledge", "Customer handling"], ["Drive passengers safely", "Keep the vehicle clean"], "FULL_TIME", "FLEXIBLE", "FIELD", 15000, 25000),
    # Hospitality & Food
    ("Hospitality & Food", "Cook / Chef", ["Cooking", "Hygiene", "Menu planning", "South Indian"], ["Prepare food", "Keep the kitchen clean", "Plan daily menus"], "FULL_TIME", "DAY", "ON_SITE", 15000, 30000),
    ("Hospitality & Food", "Waiter / Steward", ["Customer handling", "Communication", "Order taking"], ["Take orders", "Serve food", "Keep tables clean"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 10000, 16000),
    ("Hospitality & Food", "Kitchen Helper", ["Cleaning", "Cutting vegetables", "Physical work"], ["Help the cook", "Wash utensils", "Prepare ingredients"], "FULL_TIME", "DAY", "ON_SITE", 9000, 13000),
    ("Hospitality & Food", "Hotel Front Desk", ["Communication", "English", "Booking software", "Customer handling"], ["Check guests in and out", "Handle bookings", "Answer guest queries"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 13000, 22000),
    ("Hospitality & Food", "Housekeeping Staff", ["Cleaning", "Hygiene", "Physical work"], ["Clean rooms", "Change linen", "Report repairs"], "FULL_TIME", "DAY", "ON_SITE", 9000, 14000),
    # Construction & Site
    ("Construction & Site", "Mason", ["Brickwork", "Plastering", "Reading drawings"], ["Build walls", "Plaster surfaces", "Follow the site supervisor"], "CONTRACT", "DAY", "FIELD", 18000, 28000),
    ("Construction & Site", "Site Supervisor", ["Team handling", "Reading drawings", "Material planning", "Safety"], ["Supervise workers", "Track daily progress", "Check material use"], "FULL_TIME", "DAY", "FIELD", 20000, 35000),
    ("Construction & Site", "Construction Helper", ["Physical work", "Material handling"], ["Carry material", "Help masons", "Clean the site"], "TEMPORARY", "DAY", "FIELD", 10000, 15000),
    ("Construction & Site", "Painter", ["Wall painting", "Putty work", "Colour mixing"], ["Prepare walls", "Paint neatly", "Clean up after work"], "CONTRACT", "DAY", "FIELD", 15000, 25000),
    # Technician & Repair
    ("Technician & Repair", "Electrician", ["Wiring", "Electrical repair", "Safety", "Meter reading"], ["Install and repair wiring", "Fix faults", "Follow safety rules"], "FULL_TIME", "DAY", "FIELD", 15000, 25000),
    ("Technician & Repair", "Plumber", ["Pipe fitting", "Leak repair", "Bathroom fittings"], ["Install pipes and fittings", "Fix leaks", "Maintain water lines"], "FULL_TIME", "DAY", "FIELD", 15000, 25000),
    ("Technician & Repair", "AC Technician", ["AC installation", "AC servicing", "Gas filling", "Electrical basics"], ["Install AC units", "Service and repair ACs", "Explain issues to customers"], "FULL_TIME", "DAY", "FIELD", 15000, 28000),
    ("Technician & Repair", "Mobile Repair Technician", ["Mobile repair", "Soldering", "Software flashing", "Customer handling"], ["Diagnose phone faults", "Replace parts", "Install software"], "FULL_TIME", "DAY", "ON_SITE", 12000, 25000),
    ("Technician & Repair", "Two-Wheeler Mechanic", ["Bike repair", "Engine work", "Servicing"], ["Service bikes", "Repair engines", "Test vehicles after repair"], "FULL_TIME", "DAY", "ON_SITE", 12000, 22000),
    # IT & Computer
    ("IT & Computer", "Software Developer", ["Programming", "JavaScript", "Python", "Databases", "Git"], ["Build and fix software", "Write clean code", "Work with the team"], "FULL_TIME", "DAY", "ON_SITE", 25000, 60000),
    ("IT & Computer", "Web Designer", ["HTML/CSS", "Figma", "WordPress", "Graphic design"], ["Design web pages", "Update websites", "Create graphics"], "FULL_TIME", "DAY", "ON_SITE", 15000, 35000),
    ("IT & Computer", "Computer Operator", ["Typing", "MS Office", "Internet", "Printing"], ["Operate computers", "Prepare documents", "Maintain files"], "FULL_TIME", "DAY", "ON_SITE", 10000, 18000),
    ("IT & Computer", "IT Support / Hardware", ["Hardware", "Networking", "Windows", "Troubleshooting"], ["Fix computer issues", "Set up networks", "Support staff"], "FULL_TIME", "DAY", "ON_SITE", 15000, 28000),
    # Education
    ("Education", "School Teacher", ["Subject knowledge", "Classroom management", "Communication", "English"], ["Teach classes", "Prepare lessons", "Check homework and tests"], "FULL_TIME", "DAY", "ON_SITE", 12000, 30000),
    ("Education", "Tuition Teacher", ["Subject knowledge", "Patience", "Communication"], ["Teach students", "Give practice work", "Track progress"], "PART_TIME", "FLEXIBLE", "ON_SITE", 8000, 20000),
    ("Education", "Computer Trainer", ["MS Office", "Tally", "Teaching", "Communication"], ["Teach computer courses", "Prepare practicals", "Support students"], "FULL_TIME", "DAY", "ON_SITE", 12000, 25000),
    # Beauty & Wellness
    ("Beauty & Wellness", "Beautician", ["Facial", "Threading", "Waxing", "Bridal makeup"], ["Provide beauty services", "Keep tools clean", "Advise clients"], "FULL_TIME", "DAY", "ON_SITE", 12000, 25000),
    ("Beauty & Wellness", "Hair Stylist", ["Hair cutting", "Hair colouring", "Styling"], ["Cut and style hair", "Advise clients", "Keep the station clean"], "FULL_TIME", "DAY", "ON_SITE", 12000, 25000),
    ("Beauty & Wellness", "Spa Therapist", ["Massage", "Hygiene", "Customer handling"], ["Give spa treatments", "Prepare rooms", "Follow hygiene rules"], "FULL_TIME", "DAY", "ON_SITE", 15000, 28000),
    # Accounts & Finance
    ("Accounts & Finance", "Accountant", ["Tally", "GST", "Excel", "Bookkeeping"], ["Maintain books", "File GST returns", "Prepare reports"], "FULL_TIME", "DAY", "ON_SITE", 18000, 35000),
    ("Accounts & Finance", "Accounts Assistant", ["Tally", "Excel", "Data entry", "Billing"], ["Enter bills and vouchers", "Reconcile accounts", "Support the accountant"], "FULL_TIME", "DAY", "ON_SITE", 12000, 20000),
    ("Accounts & Finance", "Tally Operator", ["Tally", "GST basics", "Billing"], ["Record entries in Tally", "Generate invoices", "Maintain ledgers"], "FULL_TIME", "DAY", "ON_SITE", 12000, 20000),
    # Security & Housekeeping
    ("Security & Housekeeping", "Security Guard", ["Alertness", "Visitor management", "Physical fitness"], ["Guard the premises", "Check visitors", "Keep the security register"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 11000, 16000),
    ("Security & Housekeeping", "Cleaner / Housekeeping", ["Cleaning", "Hygiene", "Physical work"], ["Clean the premises", "Manage waste", "Restock supplies"], "FULL_TIME", "DAY", "ON_SITE", 9000, 13000),
    ("Security & Housekeeping", "Watchman", ["Alertness", "Night duty"], ["Watch the premises", "Open and close gates", "Report issues"], "FULL_TIME", "NIGHT", "ON_SITE", 9000, 13000),
    # Manufacturing & Warehouse
    ("Manufacturing & Warehouse", "Machine Operator", ["Machine handling", "Safety", "Quality checks"], ["Run machines", "Check output quality", "Report breakdowns"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 12000, 20000),
    ("Manufacturing & Warehouse", "Warehouse Helper / Packer", ["Packing", "Loading", "Physical work"], ["Pack goods", "Load and unload", "Label boxes"], "FULL_TIME", "DAY", "ON_SITE", 10000, 15000),
    ("Manufacturing & Warehouse", "Store Keeper", ["Inventory", "Excel", "Stock records"], ["Track stock in and out", "Maintain records", "Arrange the store"], "FULL_TIME", "DAY", "ON_SITE", 13000, 22000),
    ("Manufacturing & Warehouse", "Quality Checker", ["Quality checks", "Attention to detail", "Reporting"], ["Inspect products", "Record defects", "Report to supervisors"], "FULL_TIME", "DAY", "ON_SITE", 12000, 20000),
    # Customer Support & Telecalling
    ("Customer Support & Telecalling", "Telecaller", ["Communication", "Telugu", "Hindi", "Phone handling", "Basic computer"], ["Call customers", "Explain offers", "Record call outcomes"], "FULL_TIME", "DAY", "ON_SITE", 10000, 18000),
    ("Customer Support & Telecalling", "Customer Support Executive", ["Communication", "English", "Problem solving", "CRM"], ["Answer customer queries", "Solve complaints", "Log tickets"], "FULL_TIME", "ROTATIONAL", "ON_SITE", 13000, 22000),
    ("Customer Support & Telecalling", "Field Sales / Marketing Executive", ["Sales", "Two-wheeler", "Communication", "Negotiation"], ["Visit customers", "Generate leads", "Close sales", "Report daily"], "FULL_TIME", "DAY", "FIELD", 15000, 25000),
]


def seed(apps, schema_editor):  # noqa: ARG001
    template = apps.get_model("listings", "JobRoleTemplate")
    order: dict[str, int] = {}
    for category, name, skills, duties, job_type, shift, mode, low, high in TEMPLATES:
        order[category] = order.get(category, 0) + 1
        template.objects.update_or_create(
            category=category,
            name=name,
            defaults={
                "skills": skills,
                "responsibilities": duties,
                "job_type": job_type,
                "shift": shift,
                "work_mode": mode,
                "salary_min_rupees": low,
                "salary_max_rupees": high,
                "display_order": order[category],
            },
        )


class Migration(migrations.Migration):
    dependencies = [("listings", "0011_jobs_quick_post")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
