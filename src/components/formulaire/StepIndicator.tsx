'use client'

import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { FormulaireStep, STEP_NAMES } from '@/lib/formulaire/types'

interface StepIndicatorProps {
  currentStep: FormulaireStep
  completedSteps: FormulaireStep[]
}

export function StepIndicator({ currentStep, completedSteps }: StepIndicatorProps) {
  const steps: FormulaireStep[] = [1, 2, 3, 4, 5, 6]

  return (
    <div className="w-full">
      {/* Desktop */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step)
          const isCurrent = step === currentStep
          const isPast = step < currentStep

          return (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors',
                    isCompleted || isPast
                      ? 'bg-secondary text-secondary-foreground'
                      : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted || isPast ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    step
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-2 text-center max-w-[80px]',
                    isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {STEP_NAMES[step]}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2',
                    isPast ? 'bg-secondary' : 'bg-muted'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Étape {currentStep} sur 6
          </span>
          <span className="text-sm text-muted-foreground">
            {STEP_NAMES[currentStep]}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(currentStep / 6) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
