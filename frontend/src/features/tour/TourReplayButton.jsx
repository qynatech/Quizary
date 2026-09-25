import { Compass } from 'lucide-react'
import { useTour } from './TourContext'
import { Button } from '../../components/ui'

export default function TourReplayButton({ page, variant = 'default', className = '' }) {
  const { replayTour } = useTour()
  const replay = () => replayTour(page, variant)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={replay}
      icon={<Compass className="w-4 h-4" />}
      className={`shrink-0 ${className}`}
      aria-label="Replay product tour"
      title="Replay product tour"
    >
      Replay tour
    </Button>
  )
}
