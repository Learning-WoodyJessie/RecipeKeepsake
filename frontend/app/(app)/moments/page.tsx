import { redirect } from 'next/navigation'

// /moments is the canonical URL for the audio/moments view
export default function MomentsPage() {
  redirect('/recipes?type=audio')
}
