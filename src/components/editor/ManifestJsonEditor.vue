<script setup>
import { computed, ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import { Copy, Check } from 'lucide-vue-next'

const model = defineModel({
  type: String,
  default: '',
})

const editorWrapper = ref(null)
const { copy, copied } = useClipboard()

const lineCount = computed(() => model.value.split('\n').length)

const highlightedLines = computed(() => tokenizeJsonLines(model.value))

function handleInput(event) {
  const textarea = event.target
  const wrapper = editorWrapper.value

  if (!wrapper) {
    return
  }

  wrapper.style.height = 'auto'
  wrapper.style.height = `${textarea.scrollHeight}px`
  wrapper.style.width = 'auto'
  wrapper.style.width = `${textarea.scrollWidth}px`
}

function getTokenClass(match) {
  if (/^"/.test(match)) {
    return /:$/.test(match)
      ? 'text-blue-600 dark:text-blue-400 font-semibold'
      : 'text-green-600 dark:text-green-400'
  }

  if (/^(true|false)$/.test(match)) {
    return 'text-orange-600 dark:text-orange-400 font-bold'
  }

  if (match === 'null') {
    return 'text-red-500 dark:text-red-400 font-bold italic'
  }

  return 'text-purple-600 dark:text-purple-400'
}

function tokenizeJsonLines(json) {
  return (json || '').split('\n').map((line) => tokenizeJsonLine(line))
}

function tokenizeJsonLine(line) {
  const tokens = []
  const tokenPattern =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g

  let lastIndex = 0
  let match

  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        text: line.slice(lastIndex, match.index),
        className: '',
      })
    }

    tokens.push({
      text: match[0],
      className: getTokenClass(match[0]),
    })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < line.length) {
    tokens.push({
      text: line.slice(lastIndex),
      className: '',
    })
  }

  if (tokens.length === 0) {
    tokens.push({
      text: '',
      className: '',
    })
  }

  return tokens
}
</script>

<template>
  <div class="flex-1 flex relative font-mono text-sm bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-white/10 rounded-2xl overflow-hidden group focus-within:ring-2 focus-within:ring-blue-500 min-h-[500px]">
    <div class="bg-zinc-100 dark:bg-zinc-900/60 text-zinc-400 dark:text-zinc-600 text-right select-none px-2 py-4 border-r border-zinc-200 dark:border-white/10 min-w-[3rem]" aria-hidden="true">
      <div v-for="n in lineCount" :key="n">{{ n }}</div>
    </div>

    <div class="relative flex-1 overflow-auto no-scrollbar">
      <div ref="editorWrapper" class="relative min-w-full inline-block min-h-full">
        <pre aria-hidden="true" class="absolute inset-0 p-4 pointer-events-none whitespace-pre text-transparent z-0" style="font-family: inherit;">
<template v-for="(line, lineIndex) in highlightedLines" :key="lineIndex"><span v-for="(token, tokenIndex) in line" :key="`${lineIndex}-${tokenIndex}`" :class="token.className">{{ token.text }}</span><br v-if="lineIndex < highlightedLines.length - 1" /></template></pre>

        <textarea
          v-model="model"
          class="w-full h-full absolute inset-0 bg-transparent text-transparent caret-zinc-900 dark:caret-white p-4 outline-none resize-none z-10 whitespace-pre overflow-hidden"
          style="font-family: inherit;"
          spellcheck="false"
          @input="handleInput"
        ></textarea>
      </div>
    </div>

    <button
      @click="copy(model.value)"
      class="absolute top-4 right-4 z-20 p-2 rounded-lg bg-white/10 backdrop-blur-sm hover:bg-white/20 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors border border-zinc-200/50 dark:border-zinc-700/50"
      title="Copy JSON"
    >
      <Check v-if="copied" class="w-4 h-4 text-emerald-500" />
      <Copy v-else class="w-4 h-4" />
    </button>
  </div>
</template>

<style scoped>
textarea {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
