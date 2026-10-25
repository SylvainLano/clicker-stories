// Story and quiz bookkeeping on the saved state (GameData in the Java version).
// Story blocks are identified as "<story file>-<block index>", e.g. "storyBlockUplifting1-3".

export const blockId = (storyId, index) => `${storyId}-${index}`
export const storyIdOf = (blockIdValue) => blockIdValue.slice(0, blockIdValue.indexOf('-'))

// Marks a block as read. Returns true when this completes the story.
export function markBlockRead(state, storyId, index, blocks) {
  const id = blockId(storyId, index)
  if (state.readStoryBlockIds.has(id)) return false
  state.readStoryBlockIds.add(id)
  const complete = blocks.every((_, i) => state.readStoryBlockIds.has(blockId(storyId, i)))
  if (complete) {
    state.finishedStoryIds.add(storyId)
    state.startedStoryIds.delete(storyId)
  }
  return complete
}

// First unread block of a story (0 when everything was read).
export function nextUnreadBlock(state, storyId, blocks) {
  const index = blocks.findIndex((_, i) => !state.readStoryBlockIds.has(blockId(storyId, i)))
  return index === -1 ? 0 : index
}

// Returns true when the story is newly started.
export function markStoryStarted(state, storyId) {
  if (state.startedStoryIds.has(storyId) || state.finishedStoryIds.has(storyId)) return false
  state.startedStoryIds.add(storyId)
  return true
}

// Read blocks whose quiz question hasn't been answered right yet.
export function unansweredBlockIds(state) {
  return [...state.readStoryBlockIds].filter((id) => !state.answeredQuizzBlockIds.has(id))
}

// Records a right answer. Returns true when it completes the quizzes of a finished story: the story bonus
// unlocks, and the story's read blocks are forgotten so that it can be read (and quizzed) again.
export function markQuizzAnswered(state, questionId, quizzBlocks) {
  if (state.answeredQuizzBlockIds.has(questionId)) return false
  state.answeredQuizzBlockIds.add(questionId)
  const allAnswered = quizzBlocks.every((block) => state.answeredQuizzBlockIds.has(block.trigger))
  const storyId = storyIdOf(questionId)
  if (!allAnswered || !state.finishedStoryIds.has(storyId)) return false

  for (const set of [state.readStoryBlockIds, state.answeredQuizzBlockIds]) {
    for (const id of set) if (id.startsWith(storyId)) set.delete(id)
  }
  state.finishedQuizzIds.add(storyId)
  return true
}
