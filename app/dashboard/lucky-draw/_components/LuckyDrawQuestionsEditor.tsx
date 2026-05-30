'use client'

import { useMemo, useState, type HTMLAttributes } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { LuckyDrawQuestion, LuckyDrawQuestionType } from '@/app/lib/lucky-draw/types'

const QUESTION_TYPES: { value: LuckyDrawQuestionType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'tag_picker', label: 'Tag picker' },
]

export function createEmptyQuestion(): LuckyDrawQuestion {
  return {
    id: crypto.randomUUID(),
    sort_order: 0,
    question_type: 'text',
    question_text: '',
    is_required: true,
  }
}

export function ensureQuestionIds(questions: LuckyDrawQuestion[]): LuckyDrawQuestion[] {
  return questions.map((q, index) => ({
    ...q,
    id: q.id ?? crypto.randomUUID(),
    sort_order: index,
  }))
}

function questionSortId(q: LuckyDrawQuestion): string {
  return q.id!
}

type Props = {
  questions: LuckyDrawQuestion[]
  onChange: (questions: LuckyDrawQuestion[]) => void
}

type QuestionCardProps = {
  question: LuckyDrawQuestion
  index: number
  onUpdate: (index: number, patch: Partial<LuckyDrawQuestion>) => void
  onRemove: (index: number) => void
  isOverlay?: boolean
}

function QuestionCardContent({
  question,
  index,
  onUpdate,
  onRemove,
  dragHandleProps,
  isDragging,
}: QuestionCardProps & {
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>
  isDragging?: boolean
}) {
  return (
    <>
      <div className="mb-3 flex items-start gap-2">
        <button
          type="button"
          {...dragHandleProps}
          className={`mt-0.5 inline-flex shrink-0 touch-none items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          aria-label="Drag to reorder question"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={question.question_type}
              onChange={(e) =>
                onUpdate(index, {
                  question_type: e.target.value as LuckyDrawQuestionType,
                })
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="text-sm text-red-600 hover:text-red-700 sm:text-left"
            >
              Remove
            </button>
          </div>

          <input
            value={question.question_text}
            onChange={(e) => onUpdate(index, { question_text: e.target.value })}
            placeholder="Question text"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />

          {question.question_type === 'multiple_choice' && (
            <textarea
              value={(question.options ?? []).join('\n')}
              onChange={(e) =>
                onUpdate(index, {
                  options: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              placeholder="One option per line"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          )}
        </div>
      </div>
    </>
  )
}

function SortableQuestionCard(props: QuestionCardProps) {
  const id = questionSortId(props.question)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="min-h-[7.5rem] rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40"
        aria-hidden
      />
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <QuestionCardContent
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

export function LuckyDrawQuestionsEditor({ questions, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sortIds = useMemo(() => questions.map((q) => questionSortId(q)), [questions])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activeIndex = activeId ? sortIds.indexOf(activeId) : -1
  const activeQuestion = activeIndex >= 0 ? questions[activeIndex] : null

  const updateQuestion = (index: number, patch: Partial<LuckyDrawQuestion>) => {
    const next = [...questions]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  const removeQuestion = (index: number) => {
    onChange(
      questions
        .filter((_, idx) => idx !== index)
        .map((q, i) => ({ ...q, sort_order: i }))
    )
  }

  const addQuestion = () => {
    onChange([
      ...questions,
      { ...createEmptyQuestion(), sort_order: questions.length },
    ])
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sortIds.indexOf(String(active.id))
    const newIndex = sortIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    onChange(
      arrayMove(questions, oldIndex, newIndex).map((q, i) => ({
        ...q,
        sort_order: i,
      }))
    )
  }

  const handleDragCancel = () => setActiveId(null)

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">Built-in questions</p>
      <p className="mb-3 text-xs text-slate-500">
        Saving purpose (all tags) and location (Locate me) are always included.
      </p>

      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">Custom questions</label>
        <button
          type="button"
          onClick={addQuestion}
          className="hidden text-sm text-blue-600 hover:text-blue-700 sm:inline"
        >
          + Add question
        </button>
      </div>

      {questions.length > 0 && (
        <p className="mb-3 text-xs text-slate-500 sm:hidden">
          Hold the grip handle, then drag to reorder.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {questions.map((q, i) => (
              <SortableQuestionCard
                key={questionSortId(q)}
                question={q}
                index={i}
                onUpdate={updateQuestion}
                onRemove={removeQuestion}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }}>
          {activeQuestion && activeIndex >= 0 ? (
            <div className="rounded-xl border border-blue-300 bg-white p-4 shadow-xl ring-2 ring-blue-200/60">
              <QuestionCardContent
                question={activeQuestion}
                index={activeIndex}
                onUpdate={updateQuestion}
                onRemove={removeQuestion}
                isDragging
                dragHandleProps={{}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        onClick={addQuestion}
        className="mt-4 w-full rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-3 text-sm font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 sm:hidden"
      >
        + Add question
      </button>
    </div>
  )
}
