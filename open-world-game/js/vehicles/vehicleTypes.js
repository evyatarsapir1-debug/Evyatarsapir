// Vehicle catalog. All values in meters, m/s, m/s^2. Every type is fully drivable.
export const VEHICLE_TYPES = {
  sedan:   { name: 'סדאן משפחתית', kind: 'car', L: 4.6, W: 1.85, H: 1.45, wheelbase: 2.7, maxSpeed: 42, accel: 7.5, brake: 16, steerMax: 0.6, grip: 9, mass: 1400, colors: [0xc0392b, 0x2e86c1, 0xecf0f1, 0x2c3e50, 0x7f8c8d, 0x16a085, 0xd4ac0d], price: 18000 },
  hatch:   { name: 'האצ׳בק עירונית', kind: 'car', L: 4.0, W: 1.75, H: 1.5, wheelbase: 2.45, maxSpeed: 38, accel: 7, brake: 15, steerMax: 0.65, grip: 9, mass: 1100, colors: [0xf39c12, 0x27ae60, 0x8e44ad, 0xecf0f1, 0xe74c3c], price: 12000 },
  luxury:  { name: 'רכב יוקרה', kind: 'car', L: 5.1, W: 1.95, H: 1.45, wheelbase: 3.1, maxSpeed: 52, accel: 9, brake: 18, steerMax: 0.55, grip: 10, mass: 1900, colors: [0x111111, 0xf5f5f5, 0x1b2631, 0x5d6d7e], price: 85000 },
  sports:  { name: 'רכב ספורט', kind: 'car', L: 4.5, W: 1.95, H: 1.2, wheelbase: 2.6, maxSpeed: 68, accel: 13, brake: 22, steerMax: 0.55, grip: 12, mass: 1350, colors: [0xe60000, 0xffcc00, 0x0066ff, 0xff6600, 0x00b894], price: 140000 },
  suv:     { name: 'רכב שטח', kind: 'car', L: 4.8, W: 2.0, H: 1.85, wheelbase: 2.85, maxSpeed: 44, accel: 8, brake: 15, steerMax: 0.55, grip: 8.5, mass: 2200, colors: [0x2d3436, 0x6c5ce7, 0x00b894, 0xb2bec3, 0x8b5a2b], price: 45000, offroad: true },
  taxi:    { name: 'מונית', kind: 'car', L: 4.7, W: 1.85, H: 1.5, wheelbase: 2.75, maxSpeed: 42, accel: 7.5, brake: 16, steerMax: 0.6, grip: 9, mass: 1450, colors: [0xf7dc6f], price: 22000, taxi: true },
  bus:     { name: 'אוטובוס עירוני', kind: 'car', L: 11.5, W: 2.55, H: 3.1, wheelbase: 6.2, maxSpeed: 25, accel: 3.5, brake: 9, steerMax: 0.6, grip: 7, mass: 11000, colors: [0x1e8449, 0x2471a3], price: 120000, bus: true },
  truck:   { name: 'משאית', kind: 'car', L: 8.2, W: 2.45, H: 3.2, wheelbase: 4.8, maxSpeed: 28, accel: 4, brake: 10, steerMax: 0.6, grip: 7.5, mass: 8000, colors: [0xecf0f1, 0xc0392b, 0x2980b9], price: 70000, truck: true },
  police:  { name: 'ניידת משטרה', kind: 'car', L: 4.8, W: 1.9, H: 1.5, wheelbase: 2.8, maxSpeed: 50, accel: 9.5, brake: 18, steerMax: 0.6, grip: 10, mass: 1600, colors: [0xf5f5f5], price: 0, police: true },
  moto:    { name: 'אופנוע', kind: 'moto', L: 2.1, W: 0.8, H: 1.2, wheelbase: 1.45, maxSpeed: 55, accel: 11, brake: 16, steerMax: 0.5, grip: 10, mass: 220, colors: [0x111111, 0xc0392b, 0x2471a3, 0xf1c40f], price: 15000 },
  bicycle: { name: 'אופניים', kind: 'bike', L: 1.75, W: 0.6, H: 1.1, wheelbase: 1.05, maxSpeed: 11, accel: 3, brake: 7, steerMax: 0.6, grip: 9, mass: 15, colors: [0x2ecc71, 0xe74c3c, 0x3498db, 0x34495e], price: 600 },
  heli:    { name: 'מסוק', kind: 'heli', L: 9.5, W: 2.4, H: 3.0, wheelbase: 3, maxSpeed: 45, accel: 8, brake: 6, steerMax: 0, grip: 3, mass: 2500, colors: [0x1f3a5f, 0xe74c3c, 0xf5f5f5], price: 400000 },
};

// Weighted pool used for parked cars and traffic
export const PARKED_POOL = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'luxury', 'sports', 'taxi', 'moto', 'bicycle', 'sedan', 'suv'];
export const TRAFFIC_POOL = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'taxi', 'taxi', 'luxury', 'sports', 'bus', 'truck', 'moto', 'police'];
