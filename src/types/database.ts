export type UserRole = 'admin' | 'supervisor' | 'consulta'
export type OrderStatus = 'pendiente' | 'en_proceso' | 'terminada' | 'pausada'
export type EfficiencyStatus = 'green' | 'yellow' | 'red'

export interface Profile {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export interface Operator {
  id: string
  name: string
  code: string | null
  document: string | null
  position: string | null
  line: string | null
  hire_date: string | null
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface GarmentReference {
  id: string
  code: string
  name: string
  garment_type: string | null
  client: string | null
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ReferenceOperation {
  id: string
  reference_id: string
  operation_number: number
  operation_name: string
  machine_type: string | null
  standard_minutes: number
  sort_order: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductionOrder {
  id: string
  order_number: string
  reference_id: string
  total_quantity: number
  start_date: string | null
  estimated_end_date: string | null
  status: OrderStatus
  notes: string | null
  created_at: string
  updated_at: string
  garment_references?: Pick<GarmentReference, 'id' | 'code' | 'name'> | null
}

export interface DailyProductionHeader {
  id: string
  production_date: string
  operator_id: string
  production_order_id: string
  installed_capacity_minutes: number
  start_time: string | null
  end_time: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DailyProductionEntry {
  id: string
  header_id: string
  reference_operation_id: string
  delivered_units: number
  defective_units: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DailyOperatorEfficiency {
  production_date: string
  operator_id: string
  operator_name: string
  production_order_id: string
  order_number: string
  reference_id: string
  reference_code: string
  reference_name: string
  installed_capacity_minutes: number
  total_delivered_units: number
  total_defective_units: number
  total_delivered_minutes: number
  efficiency_percentage: number
}

export interface ReferenceEfficiency {
  production_date: string
  reference_id: string
  reference_code: string
  reference_name: string
  total_delivered_units: number
  total_defective_units: number
  total_delivered_minutes: number
  efficiency_percentage: number
}

export interface OrderEfficiency {
  production_date: string
  production_order_id: string
  order_number: string
  reference_id: string
  reference_code: string
  reference_name: string
  total_delivered_units: number
  total_defective_units: number
  total_delivered_minutes: number
  efficiency_percentage: number
}

export interface ProductionEntryCalculation {
  entry_id: string
  header_id: string
  production_date: string
  operator_id: string
  production_order_id: string
  reference_operation_id: string
  delivered_units: number
  defective_units: number
  standard_minutes: number
  delivered_minutes: number
}

export interface OperatorDailySummary {
  operator_id: string
  operator_name: string
  installed_capacity_minutes: number
  total_delivered_minutes: number
  total_delivered_units: number
  total_defective_units: number
  efficiency_percentage: number
  status: EfficiencyStatus
}
