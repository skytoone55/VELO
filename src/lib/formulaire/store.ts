import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { FormulaireData, FormulaireStep } from './types'
import { Depot } from '@/lib/types/database'

interface FormulaireStore {
  // État
  clientId: string | null
  currentStep: FormulaireStep
  completedSteps: FormulaireStep[]
  data: FormulaireData
  isHorsZone: boolean
  depotsDisponibles: Depot[]
  isLoading: boolean
  error: string | null
  isBlocked: boolean
  tentativesEnemat: number

  // Actions
  setClientId: (id: string) => void
  setStep: (step: FormulaireStep) => void
  nextStep: () => void
  prevStep: () => void
  markStepCompleted: (step: FormulaireStep) => void
  updateData: (data: Partial<FormulaireData>) => void
  setHorsZone: (value: boolean) => void
  setDepotsDisponibles: (depots: Depot[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setBlocked: (blocked: boolean) => void
  incrementTentativesEnemat: () => void
  reset: () => void
}

const initialState = {
  clientId: null,
  currentStep: 1 as FormulaireStep,
  completedSteps: [] as FormulaireStep[],
  data: {},
  isHorsZone: false,
  depotsDisponibles: [],
  isLoading: false,
  error: null,
  isBlocked: false,
  tentativesEnemat: 0,
}

export const useFormulaireStore = create<FormulaireStore>()(
  persist(
    (set) => ({
      ...initialState,

      setClientId: (id) => set({ clientId: id }),

      setStep: (step) => set({ currentStep: step }),

      nextStep: () =>
        set((state) => {
          const completedSteps = state.completedSteps.includes(state.currentStep)
            ? state.completedSteps
            : [...state.completedSteps, state.currentStep]
          return {
            currentStep: Math.min(state.currentStep + 1, 6) as FormulaireStep,
            completedSteps,
          }
        }),

      prevStep: () =>
        set((state) => ({
          currentStep: Math.max(state.currentStep - 1, 1) as FormulaireStep,
        })),

      markStepCompleted: (step) =>
        set((state) => ({
          completedSteps: state.completedSteps.includes(step)
            ? state.completedSteps
            : [...state.completedSteps, step],
        })),

      updateData: (data) =>
        set((state) => ({
          data: { ...state.data, ...data },
        })),

      setHorsZone: (value) => set({ isHorsZone: value }),

      setDepotsDisponibles: (depots) => set({ depotsDisponibles: depots }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      setBlocked: (blocked) => set({ isBlocked: blocked }),

      incrementTentativesEnemat: () =>
        set((state) => {
          const newCount = state.tentativesEnemat + 1
          return {
            tentativesEnemat: newCount,
            isBlocked: newCount >= 3,
          }
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'ecovolt-formulaire',
      partialize: (state) => ({
        clientId: state.clientId,
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        data: state.data,
        isBlocked: state.isBlocked,
        tentativesEnemat: state.tentativesEnemat,
      }),
    }
  )
)
