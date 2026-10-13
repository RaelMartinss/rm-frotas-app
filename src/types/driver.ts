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

export interface TripWaypoint {
  id: string;
  order: number;
  type: 'FUEL' | 'REST' | 'STOP' | string;
  title: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
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
  waypoints?: TripWaypoint[];
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

export interface QueuedOfflineFuel {
  id?: string;
  idempotencyKey: string;
  dto: DriverFuelDTO;
  timestamp: string;
  status?: 'PENDING' | 'SYNCING' | 'DEAD';
  error?: string | null;
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
  offlineStatus?: 'PENDING' | 'SYNCING' | 'DEAD';
  offlineActionId?: string;
  offlineError?: string | null;
}

export interface LocationPingDTO {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number; // km/h
  heading?: number;
  recordedAt?: string;
}

export interface RecordLocationBatchDTO {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  recordedAt?: string;
  pings?: LocationPingDTO[];
}

export type IncidentCategory = 'PNEU' | 'MECANICA' | 'ELETRICA' | 'ACIDENTE' | 'ATRASO' | 'OUTRO';

export interface ReportIncidentDTO {
  tripId?: string;
  vehicleId?: string;
  category: IncidentCategory;
  description?: string;
  latitude?: number;
  longitude?: number;
  locationAddress?: string;
  photoUrl?: string;
  photos?: string[];
  checklist?: any;
}

export interface ReportIncidentResult {
  message: string;
  incidentId: string;
  protocol: string;
  category: IncidentCategory;
  description: string;
  recordedAt: string;
  latitude?: number;
  longitude?: number;
  locationAddress?: string;
  photoUrl?: string;
  photos?: string[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  category: 'SEGURANCA' | 'ILUMINACAO' | 'MECANICA' | 'FLUIDOS' | 'DOCUMENTOS';
  status: 'OK' | 'DEFECT' | 'NOT_APPLICABLE';
  notes?: string;
}

export interface TripChecklistDTO {
  tripId: string;
  items: ChecklistItem[];
  notes?: string;
  signature?: string;
  allApproved?: boolean;
  vehiclePlate?: string;
}

