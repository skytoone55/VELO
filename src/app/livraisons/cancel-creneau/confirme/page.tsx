import { CheckCircle } from 'lucide-react'

export default function CancelCreneauConfirmePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="flex justify-center mb-6">
          <CheckCircle className="h-16 w-16 text-green-500" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-3">
          Votre demande a bien été prise en compte
        </h1>

        <p className="text-gray-500 text-sm leading-relaxed">
          Un agent vous recontactera dans les plus brefs délais pour convenir
          d&apos;un nouveau créneau.
        </p>
      </div>
    </div>
  )
}
