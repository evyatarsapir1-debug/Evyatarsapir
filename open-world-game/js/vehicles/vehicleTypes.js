// Vehicle catalog. All values in meters, m/s, m/s^2. Every type is fully drivable.
export const VEHICLE_TYPES = {
  sedan:   { name: 'סדאן משפחתית', kind: 'car', L: 4.6, W: 1.85, H: 1.45, wheelbase: 2.7, maxSpeed: 42, accel: 7.5, brake: 16, steerMax: 0.6, grip: 9, mass: 1400, colors: [0xc0392b, 0x2e86c1, 0xecf0f1, 0x2c3e50, 0x7f8c8d, 0x16a085, 0xd4ac0d], price: 18000 },
  hatch:   { name: 'האצ׳בק עירונית', kind: 'car', L: 4.0, W: 1.75, H: 1.5, wheelbase: 2.45, maxSpeed: 38, accel: 7, brake: 15, steerMax: 0.65, grip: 9, mass: 1100, colors: [0xf39c12, 0x27ae60, 0x8e44ad, 0xecf0f1, 0xe74c3c], price: 12000 },
  luxury:  { name: 'רכב יוקרה', kind: 'car', L: 5.1, W: 1.95, H: 1.45, wheelbase: 3.1, maxSpeed: 52, accel: 9, brake: 18, steerMax: 0.55, grip: 10, mass: 1900, colors: [0x111111, 0xf5f5f5, 0x1b2631, 0x5d6d7e], price: 85000 },
  sports:  { spoiler: true, name: 'רכב ספורט', kind: 'car', L: 4.5, W: 1.95, H: 1.2, wheelbase: 2.6, maxSpeed: 68, accel: 13, brake: 22, steerMax: 0.55, grip: 12, mass: 1350, colors: [0xe60000, 0xffcc00, 0x0066ff, 0xff6600, 0x00b894], price: 140000 },
  suv:     { name: 'רכב שטח', kind: 'car', L: 4.8, W: 2.0, H: 1.85, wheelbase: 2.85, maxSpeed: 44, accel: 8, brake: 15, steerMax: 0.55, grip: 8.5, mass: 2200, colors: [0x2d3436, 0x6c5ce7, 0x00b894, 0xb2bec3, 0x8b5a2b], price: 45000, offroad: true },
  taxi:    { name: 'מונית', kind: 'car', L: 4.7, W: 1.85, H: 1.5, wheelbase: 2.75, maxSpeed: 42, accel: 7.5, brake: 16, steerMax: 0.6, grip: 9, mass: 1450, colors: [0xf7dc6f], price: 22000, taxi: true },
  bus:     { name: 'אוטובוס עירוני', kind: 'car', L: 11.5, W: 2.55, H: 3.1, wheelbase: 6.2, maxSpeed: 25, accel: 3.5, brake: 9, steerMax: 0.6, grip: 7, mass: 11000, colors: [0x1e8449, 0x2471a3], price: 120000, bus: true },
  truck:   { name: 'משאית', kind: 'car', L: 8.2, W: 2.45, H: 3.2, wheelbase: 4.8, maxSpeed: 28, accel: 4, brake: 10, steerMax: 0.6, grip: 7.5, mass: 8000, colors: [0xecf0f1, 0xc0392b, 0x2980b9], price: 70000, truck: true },
  police:  { name: 'ניידת משטרה', kind: 'car', L: 4.8, W: 1.9, H: 1.5, wheelbase: 2.8, maxSpeed: 50, accel: 9.5, brake: 18, steerMax: 0.6, grip: 10, mass: 1600, colors: [0xf5f5f5], price: 0, police: true },
  coupe:   { name: 'קופה "סילון"', kind: 'car', L: 4.4, W: 1.85, H: 1.3, wheelbase: 2.6, maxSpeed: 50, accel: 9.5, brake: 18, steerMax: 0.58, grip: 10.5, mass: 1350, colors: [0x1abc9c, 0xe74c3c, 0xecf0f1, 0x34495e, 0x9b59b6], price: 38000, coupe: true },
  pickup:  { name: 'טנדר "שדה"', kind: 'car', L: 5.2, W: 1.95, H: 1.8, wheelbase: 3.1, maxSpeed: 40, accel: 7.5, brake: 14, steerMax: 0.55, grip: 8.5, mass: 2100, colors: [0x7f8c8d, 0xc0392b, 0x2c3e50, 0xd35400, 0xecf0f1], price: 36000, offroad: true, pickup: true },
  van:     { name: 'מסחרית "קשת"', kind: 'car', L: 5.0, W: 1.95, H: 2.1, wheelbase: 3.0, maxSpeed: 36, accel: 6, brake: 13, steerMax: 0.58, grip: 8, mass: 2300, colors: [0xffffff, 0xbdc3c7, 0x2471a3, 0xf4d03f], price: 30000, van: true },
  convertible: { name: 'מכונית פתוחה "רוח"', kind: 'car', L: 4.5, W: 1.85, H: 1.25, wheelbase: 2.65, maxSpeed: 52, accel: 9.5, brake: 18, steerMax: 0.58, grip: 10.5, mass: 1400, colors: [0xff7675, 0x74b9ff, 0xfdcb6e, 0xffffff], price: 60000, convertible: true },
  muscle:  { name: 'מאסל "רעם"', kind: 'car', L: 4.9, W: 1.95, H: 1.35, wheelbase: 2.9, maxSpeed: 58, accel: 11, brake: 17, steerMax: 0.52, grip: 9, mass: 1700, colors: [0x111111, 0xe67e22, 0x2980b9, 0xc0392b], price: 70000, scoop: true },
  hyper:   { name: 'על־מכונית "ברק"', kind: 'car', L: 4.6, W: 2.0, H: 1.12, wheelbase: 2.7, maxSpeed: 82, accel: 16, brake: 26, steerMax: 0.5, grip: 13.5, mass: 1300, colors: [0xf1c40f, 0x00cec9, 0xe84393, 0x2d3436], price: 900000, spoiler: true },
  tug:     { name: 'גורר מזוודות', kind: 'car', L: 3.0, W: 1.6, H: 1.5, wheelbase: 1.9, maxSpeed: 14, accel: 4, brake: 10, steerMax: 0.7, grip: 8, mass: 1500, colors: [0xf39c12, 0xf1c40f], price: 9000, convertible: true },
  fuel:    { name: 'מכלית דלק', kind: 'car', L: 8.0, W: 2.45, H: 3.1, wheelbase: 4.6, maxSpeed: 22, accel: 3.5, brake: 9, steerMax: 0.6, grip: 7.5, mass: 9000, colors: [0xecf0f1], price: 80000, truck: true, tank: true },
  moto:    { name: 'אופנוע', kind: 'moto', L: 2.1, W: 0.8, H: 1.2, wheelbase: 1.45, maxSpeed: 55, accel: 11, brake: 16, steerMax: 0.5, grip: 10, mass: 220, colors: [0x111111, 0xc0392b, 0x2471a3, 0xf1c40f], price: 15000 },
  bicycle: { name: 'אופניים', kind: 'bike', L: 1.75, W: 0.6, H: 1.1, wheelbase: 1.05, maxSpeed: 11, accel: 3, brake: 7, steerMax: 0.6, grip: 9, mass: 15, colors: [0x2ecc71, 0xe74c3c, 0x3498db, 0x34495e], price: 600 },
  jet:     { name: 'מטוס נוסעים', kind: 'plane', L: 39, W: 4.2, H: 6.2, wheelbase: 16, maxSpeed: 112, accel: 6.5, brake: 5, steerMax: 0.5, grip: 6, mass: 60000, colors: [0, 1, 2], price: 0 },
  fighter: { name: 'מטוס קרב', kind: 'plane', fighter: true, enclosed: true, L: 15.5, W: 2.2, H: 4.2, wheelbase: 6, maxSpeed: 165, accel: 17, brake: 6, steerMax: 0.45, grip: 6, mass: 15000, colors: [0x6f7a80, 0x5f6b54], price: 0, agility: 2.3 },
  tank:    { name: 'טנק', kind: 'car', mil: 'tank', tank: true, enclosed: true, L: 7.6, W: 3.6, H: 2.5, wheelbase: 4.2, maxSpeed: 17, accel: 4.2, brake: 12, steerMax: 0.75, grip: 14, mass: 45000, colors: [0x5b6340, 0x6b6a45], price: 0 },
  apc:     { name: 'נגמ״ש', kind: 'car', mil: 'apc', enclosed: true, L: 7.0, W: 2.9, H: 2.4, wheelbase: 3.6, maxSpeed: 26, accel: 5.5, brake: 13, steerMax: 0.6, grip: 11, mass: 18000, colors: [0x5b6340], price: 0 },
  mjeep:   { name: 'ג׳יפ צבאי', kind: 'car', mil: 'jeep', L: 4.4, W: 2.0, H: 1.9, wheelbase: 2.7, maxSpeed: 40, accel: 8, brake: 15, steerMax: 0.6, grip: 9.5, mass: 2400, colors: [0x5b6340, 0x6b6a45], price: 0, offroad: true },
  mtruck:  { name: 'משאית צבאית', kind: 'car', mil: 'truck', L: 8.4, W: 2.5, H: 3.3, wheelbase: 4.6, maxSpeed: 26, accel: 4, brake: 10, steerMax: 0.6, grip: 8, mass: 9000, colors: [0x5b6340], price: 0, truck: true },
  jetski:  { name: 'אופנוע ים', kind: 'boat', L: 3.0, W: 1.15, H: 1.1, wheelbase: 2, maxSpeed: 26, accel: 9, brake: 7, steerMax: 1.6, grip: 2.2, mass: 350, colors: [0xffd400, 0xe74c3c, 0x1abc9c, 0x2e86c1], price: 12000, jetski: true },
  boat:    { name: 'סירת מנוע', kind: 'boat', L: 6.6, W: 2.4, H: 1.6, wheelbase: 4, maxSpeed: 22, accel: 5.5, brake: 5, steerMax: 0.9, grip: 1.6, mass: 1800, colors: [0xffffff, 0x1f3a5f, 0xc0392b], price: 60000 },
  heli:    { name: 'מסוק', kind: 'heli', L: 9.5, W: 2.4, H: 3.0, wheelbase: 3, maxSpeed: 45, accel: 8, brake: 6, steerMax: 0, grip: 3, mass: 2500, colors: [0x1f3a5f, 0xe74c3c, 0xf5f5f5], price: 400000 },
};

// Weighted pool used for parked cars and traffic
export const PARKED_POOL = ['sedan', 'sedan', 'hatch', 'hatch', 'suv', 'luxury', 'sports', 'taxi', 'moto', 'bicycle', 'sedan', 'suv',
  'coupe', 'pickup', 'van', 'convertible', 'muscle', 'hyper', 'coupe', 'pickup'];
export const TRAFFIC_POOL = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'taxi', 'taxi', 'luxury', 'sports', 'bus', 'truck', 'moto', 'police',
  'coupe', 'pickup', 'van', 'van', 'muscle', 'convertible'];
