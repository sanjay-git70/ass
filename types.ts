export type Theme = 'light' | 'dark';

export type Page = 'dashboard' | 'machines' | 'reports' | 'userDetails' | 'settings';

export type BatchStatus = 'In Progress' | 'Completed' | 'Delayed';

export interface BatchType {
  id: string;
  batchNumber: string;
  color: string;
}

export interface Batch {
  id: string;
  name?: string;
  batchNumber: string;
  machineNumber: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  meterValue: number;
  status: BatchStatus;
  color?: string; // e.g., '#FF5733' for manual color selection
  image?: string; // Optional image URL or base64
}

export interface CalculatedBatch extends Batch {
  ftotal: number;
  average: number;
}

export interface Settings {
  companyName: string;
  numberOfMachines: number;
}

export interface MonthlyReport {
  month: string;
  totalBatches: number;
  totalMeter: number;
  totalFtotal: number;
  topMachine: {
    machineNumber: number;
    totalBatches: number;
  } | null;
  statusCounts: Record<BatchStatus, number>;
}
