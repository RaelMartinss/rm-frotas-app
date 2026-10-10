export interface DriverProfile {
  id: string;
  name: string;
  cpf: string;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpirationDate: string;
  cnhExpirationDateIso?: string;
  daysUntilCnhExpires?: number;
  canStartTrip?: boolean;
  isCnhExpired: boolean;
  status: string;
  photoUrl?: string | null;
}

export interface DriverVehicle {
  id: string;
  brand: string | null;
  model: string;
  plate: string;
  renavam?: string | null;
  year: number;
  currentKm: number;
  crlvExpiration: string | null;
  status: string;
}

export interface DriverCurrentTrip {
  id: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  originAddress: string;
  originCity: string;
  originState: string;
  destinationAddress: string;
  destinationCity: string;
  destinationState: string;
  scheduledDate?: string | null;
  estimatedArrivalDate?: string | null;
  departureDate?: string | null;
  startedAt: string | null;
  createdAt: string;
  vehicle: DriverVehicle;
}

export interface DriverPortalSummary {
  driver: DriverProfile | null;
  trip: DriverCurrentTrip | null;
  recentTripsCount: number;
  pendingReceiptsCount?: number;
  monthFuelingsCount?: number;
}

export interface StartTripDTO {
  tripId: string;
}

export interface CompleteTripDTO {
  tripId: string;
  currentKm?: number;
}

export interface DriverFuelDTO {
  vehicleId: string;
  currentKm: number;
  liters: number;
  pricePerLiter: number;
  fuelType: string;
  gasStation?: string;
  fullTank?: boolean;
  notes?: string;
  receiptUrl?: string;
  date?: string;
  occurredAt?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
}

export interface DriverHistoryItem {
  id: string;
  status: string;
  origin: string;
  destination: string;
  vehicle: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface DriverFuelHistoryItem {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  fuelType: string;
  liters: number;
  pricePerUnit: number;
  totalCost: number;
  odometerAtFueling: number;
  gasStation: string | null;
  fullTank: boolean;
  receiptUrl: string | null;
  notes: string | null;
  fueledAt: string;
  isPendingReceipt: boolean;
  isOfflineQueueItem?: boolean;
}
