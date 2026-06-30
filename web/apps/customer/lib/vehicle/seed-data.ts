export const VEHICLE_DRIVER_SEED = [
  { name: "Ravi Kumar", phone: "9876501001", rating: 4.8, vehicleCategory: "bike", vehicleNumber: "TS09 AB 1234", lat: 17.44, lng: 78.38 },
  { name: "Suresh Reddy", phone: "9876501002", rating: 4.6, vehicleCategory: "auto", vehicleNumber: "TS09 AC 5678", lat: 17.45, lng: 78.39 },
  { name: "Anil Sharma", phone: "9876501003", rating: 4.7, vehicleCategory: "taxi", vehicleNumber: "TS09 AD 9012", lat: 17.43, lng: 78.37 },
  { name: "Vikram Singh", phone: "9876501004", rating: 4.9, vehicleCategory: "premium", vehicleNumber: "TS09 AE 3456", lat: 17.46, lng: 78.40 },
  { name: "Mohan Das", phone: "9876501005", rating: 4.5, vehicleCategory: "tata_ace", vehicleNumber: "TS09 AF 7890", lat: 17.42, lng: 78.36 },
  { name: "Prakash Naidu", phone: "9876501006", rating: 4.6, vehicleCategory: "mini_truck", vehicleNumber: "TS09 AG 2345", lat: 17.41, lng: 78.35 },
  { name: "Kiran Patel", phone: "9876501007", rating: 4.7, vehicleCategory: "truck", vehicleNumber: "TS09 AH 6789", lat: 17.47, lng: 78.41 },
] as const;

export const VEHICLE_RENTAL_SEED = [
  { rentalType: "bike_rental", name: "Honda Activa", brand: "Honda", model: "Activa 6G", year: 2023, pricePerDayPaise: 35000, depositPaise: 200000 },
  { rentalType: "bike_rental", name: "Royal Enfield Classic", brand: "Royal Enfield", model: "Classic 350", year: 2022, pricePerDayPaise: 80000, depositPaise: 500000 },
  { rentalType: "car_rental", name: "Maruti Swift", brand: "Maruti", model: "Swift VXI", year: 2023, pricePerDayPaise: 150000, depositPaise: 1000000 },
  { rentalType: "car_rental", name: "Hyundai i20", brand: "Hyundai", model: "i20 Sportz", year: 2024, pricePerDayPaise: 180000, depositPaise: 1200000 },
  { rentalType: "luxury_car", name: "BMW 3 Series", brand: "BMW", model: "320d", year: 2023, pricePerDayPaise: 800000, depositPaise: 5000000 },
  { rentalType: "luxury_car", name: "Mercedes C-Class", brand: "Mercedes", model: "C200", year: 2024, pricePerDayPaise: 950000, depositPaise: 6000000 },
  { rentalType: "bus_rental", name: "Tempo Traveller 12-seater", brand: "Force", model: "Traveller", year: 2022, pricePerDayPaise: 450000, depositPaise: 3000000 },
  { rentalType: "bus_rental", name: "Mini Bus 20-seater", brand: "Ashok Leyland", model: "Dost+", year: 2021, pricePerDayPaise: 650000, depositPaise: 4000000 },
] as const;
