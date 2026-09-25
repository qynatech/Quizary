export default function TourTooltip({ backProps, closeProps, index, isLastStep, primaryProps, size, skipProps, step, tooltipProps }) {
  const hasPrevious = index > 0

  return (
    <div {...tooltipProps} aria-labelledby="joyride-tooltip-title" aria-describedby="joyride-tooltip-content" className="joyride-card relative max-h-[calc(100dvh-24px)] w-[380px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-[24px] border border-gray-200 bg-white p-5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] dark:border-gray-700 dark:bg-ink-900 sm:p-6">
      <div>
        <h2 id="joyride-tooltip-title" className="mt-2 font-display text-[20px] font-bold leading-[1.18] tracking-[-0.02em] text-gray-900 dark:text-gray-100 sm:text-[22px]">
          {step.title}
        </h2>
        <div id="joyride-tooltip-content" className="mt-2 text-[13px] leading-6 text-gray-500 dark:text-gray-400">
          {step.content}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {hasPrevious && (
            <button
              {...backProps}
              type="button"
              className="rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-ink-800 dark:hover:text-gray-200"
            >
              Back
            </button>
          )}
          <button
            {...primaryProps}
            type="button"
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-chip transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900"
          >
            {isLastStep ? 'Done' : 'Next'}
          </button>
        </div>
        {!isLastStep && (
          <button
            {...skipProps}
            type="button"
            className="rounded-lg px-2 py-2 text-xs font-semibold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 dark:text-gray-500 dark:hover:bg-ink-800 dark:hover:text-gray-200"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
