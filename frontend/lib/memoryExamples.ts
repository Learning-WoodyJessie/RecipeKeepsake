// Example text shown in the empty Title and Description boxes on the Capture and Upload screens,
// so the hint fits the kind of memory chosen. Keep it neutral: no guessing who narrated.
const EXAMPLES: Record<string, { title: string; description: string }> = {
  song:   { title: "Ammamma's lullaby",                  description: 'Sung at bedtime, the way it was handed down in the family.' },
  story:  { title: 'The year the monsoon came early',    description: 'A story told on warm evenings about how the family first came to live here.' },
  fable:  { title: 'The clever crow',                    description: 'A bedtime tale with a lesson at the end.' },
  wisdom: { title: 'What Nanamma said about patience',   description: 'A saying repeated at the dinner table whenever things got hard.' },
  poem:   { title: 'A poem for the new year',            description: 'Recited from memory at every family gathering.' },
  other:  { title: 'A memory worth keeping',             description: 'Why this one matters to the family.' },
}

export function exampleFor(memoryType: string) {
  return EXAMPLES[memoryType] ?? EXAMPLES.other
}

