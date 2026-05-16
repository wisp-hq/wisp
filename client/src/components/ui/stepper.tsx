import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

type StepStatus = "completed" | "current" | "upcoming"

interface StepItem {
  /** Unique identifier for the step */
  id: string
  /** Display title shown below the step indicator */
  title: string
}

interface StepperContextValue {
  /** Index of the currently active step (0‑based) */
  currentStep: number
  /** Set of step indices that have been completed */
  completedSteps: Set<number>
  /** Total number of steps */
  totalSteps: number
  /** Callback fired when a step indicator is clicked */
  onStepClick?: (index: number) => void
}

const StepperContext = React.createContext<StepperContextValue | null>(null)

function useStepperContext() {
  const ctx = React.useContext(StepperContext)
  if (!ctx) {
    throw new Error("Stepper compound components must be used within a <Stepper /> root.")
  }
  return ctx
}

/* ---------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------- */

function getStepStatus(
  index: number,
  currentStep: number,
  completedSteps: Set<number>,
): StepStatus {
  if (completedSteps.has(index)) return "completed"
  if (index === currentStep) return "current"
  return "upcoming"
}

/* ---------------------------------------------------------------------------
 * Stepper (Root)
 *
 * Wraps the entire step indicator. Accepts an array of steps, the current
 * step index, an optional set of completed step indices, and a click handler.
 * --------------------------------------------------------------------------- */

interface StepperProps extends React.ComponentPropsWithoutRef<"nav"> {
  /** Ordered list of steps to display */
  steps: StepItem[]
  /** Zero‑based index of the active step */
  currentStep: number
  /** Indices of steps that should show as completed. Defaults to all steps
   *  before `currentStep`. */
  completedSteps?: Set<number>
  /** Fired when a user clicks a step. Receives the step index. If omitted
   *  the steps are not interactive. */
  onStepClick?: (index: number) => void
}

function Stepper({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  className,
  ...props
}: StepperProps) {
  // Default: mark every step before the current one as completed
  const resolved = React.useMemo<Set<number>>(() => {
    if (completedSteps) return completedSteps
    const set = new Set<number>()
    for (let i = 0; i < currentStep; i++) set.add(i)
    return set
  }, [completedSteps, currentStep])

  const ctx = React.useMemo<StepperContextValue>(
    () => ({
      currentStep,
      completedSteps: resolved,
      totalSteps: steps.length,
      onStepClick,
    }),
    [currentStep, resolved, steps.length, onStepClick],
  )

  return (
    <StepperContext.Provider value={ctx}>
      <nav
        data-slot="stepper"
        aria-label="Progress"
        className={cn("flex w-full items-center justify-between", className)}
        {...props}
      >
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <StepperItem
              index={index}
              title={step.title}
              status={getStepStatus(index, currentStep, resolved)}
            />
            {index < steps.length - 1 && (
              <StepperSeparator
                completed={resolved.has(index)}
              />
            )}
          </React.Fragment>
        ))}
      </nav>
    </StepperContext.Provider>
  )
}

/* ---------------------------------------------------------------------------
 * StepperItem
 *
 * Renders a single step: numbered circle (or check icon) + title text.
 * --------------------------------------------------------------------------- */

interface StepperItemProps extends React.ComponentPropsWithoutRef<"button"> {
  index: number
  title: string
  status: StepStatus
}

function StepperItem({
  index,
  title,
  status,
  className,
}: StepperItemProps) {
  const { onStepClick } = useStepperContext()

  const isClickable = !!onStepClick
  const itemClassName = cn(
    "group flex flex-col items-center gap-1.5",
    isClickable && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
    !isClickable && "cursor-default",
    className,
  )

  const inner = (
    <>
      {/* Circle indicator */}
      <span
        data-slot="stepper-indicator"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
          status === "completed" &&
            "border-primary bg-primary text-primary-foreground",
          status === "current" &&
            "border-primary bg-background text-primary",
          status === "upcoming" &&
            "border-muted-foreground/30 bg-background text-muted-foreground",
          isClickable && "group-hover:border-primary/80",
        )}
      >
        {status === "completed" ? (
          <CheckIcon className="size-4" />
        ) : (
          <span>{index + 1}</span>
        )}
      </span>

      {/* Title – hidden on mobile to save space */}
      <span
        data-slot="stepper-title"
        className={cn(
          "hidden text-xs font-medium whitespace-nowrap transition-colors sm:block",
          status === "completed" && "text-primary",
          status === "current" && "text-foreground",
          status === "upcoming" && "text-muted-foreground",
          isClickable && "group-hover:text-foreground",
        )}
      >
        {title}
      </span>
    </>
  )

  if (isClickable) {
    return (
      <button
        type="button"
        data-slot="stepper-item"
        data-status={status}
        aria-current={status === "current" ? "step" : undefined}
        onClick={() => onStepClick(index)}
        className={itemClassName}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      data-slot="stepper-item"
      data-status={status}
      aria-current={status === "current" ? "step" : undefined}
      className={itemClassName}
    >
      {inner}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * StepperSeparator
 *
 * Connecting line between two adjacent steps.
 * --------------------------------------------------------------------------- */

interface StepperSeparatorProps extends React.ComponentPropsWithoutRef<"div"> {
  completed: boolean
}

function StepperSeparator({
  completed,
  className,
  ...props
}: StepperSeparatorProps) {
  return (
    <div
      data-slot="stepper-separator"
      role="presentation"
      className={cn(
        "h-0.5 flex-1 rounded-full transition-colors mx-2",
        completed ? "bg-primary" : "bg-muted-foreground/20",
        className,
      )}
      {...props}
    />
  )
}

/* ---------------------------------------------------------------------------
 * Exports
 * --------------------------------------------------------------------------- */

export { Stepper, StepperItem, StepperSeparator }
export type { StepItem, StepStatus, StepperProps }
