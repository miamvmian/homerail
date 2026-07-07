<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Check, ChevronLeft, CornerUpLeft, Folder, FolderOpen, GitBranch, Loader2, Server, X } from 'lucide-vue-next'
import {
  browseProjectDirectories,
  createProject,
  listGitServerRepos,
  listGitServers,
  listProjectDirectoryRoots,
} from '@/api/agent'
import type {
  CreateProjectRequest,
  Project,
  ProjectDirectoryEntry,
  ProjectDirectoryRoot,
  ProjectDirectoryServer,
} from '@/api/types/project.types'
import type { GitRepositoryInfo, GitServer } from '@/api/types/infrastructure.types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [project: Project]
}>()

const servers = ref<ProjectDirectoryServer[]>([])
const roots = ref<ProjectDirectoryRoot[]>([])
const entries = ref<ProjectDirectoryEntry[]>([])
const serverId = ref('manager')
const currentPath = ref('')
const pathInput = ref('')
const parentPath = ref<string | null>(null)
const pathWritable = ref(false)
const pathIsGitRepo = ref(false)
const projectName = ref('')
const projectNameAuto = ref(true)
const description = ref('')
const showHidden = ref(false)
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const gitServers = ref<GitServer[]>([])
const gitServersLoading = ref(false)
const selectedGitServerId = ref('')
const selectedRepoFullName = ref('')
const availableRepos = ref<GitRepositoryInfo[]>([])
const loadingRepos = ref(false)
const gitError = ref('')

const selectedServer = computed(() => servers.value.find(item => item.id === serverId.value))
const canCreate = computed(() => currentPath.value.trim() && projectName.value.trim() && !creating.value)

watch(() => props.open, (open) => {
  if (open) {
    void loadRoots()
    void loadGitServers()
  }
  else reset()
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  emit('update:open', false)
}

function reset(): void {
  entries.value = []
  currentPath.value = ''
  pathInput.value = ''
  parentPath.value = null
  pathWritable.value = false
  pathIsGitRepo.value = false
  error.value = ''
  projectName.value = ''
  projectNameAuto.value = true
  description.value = ''
  showHidden.value = false
  selectedGitServerId.value = ''
  selectedRepoFullName.value = ''
  availableRepos.value = []
  gitError.value = ''
}

function inferName(path: string): string {
  const clean = path.replace(/[\\/]+$/g, '')
  const last = clean.split(/[\\/]/).filter(Boolean).pop()
  if (last && !/^[A-Za-z]:$/.test(last)) return last
  if (/^[A-Za-z]:$/.test(last || clean)) return `${(last || clean).slice(0, 1).toUpperCase()} Drive`
  return 'Untitled Directory'
}

async function loadRoots(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await listProjectDirectoryRoots()
    servers.value = res.data?.servers ?? []
    roots.value = res.data?.roots ?? []
    serverId.value = servers.value[0]?.id || 'manager'
    const path = res.data?.default_path || roots.value[0]?.path || ''
    if (path) await browse(path)
  } catch (err: any) {
    error.value = err?.message || '目录根加载失败'
  } finally {
    loading.value = false
  }
}

async function loadGitServers(): Promise<void> {
  gitServersLoading.value = true
  gitError.value = ''
  try {
    const res = await listGitServers(true)
    gitServers.value = (res.data?.servers ?? []).filter(server => server.is_active)
  } catch (err: any) {
    gitServers.value = []
    gitError.value = err?.message || 'Git Server 加载失败'
  } finally {
    gitServersLoading.value = false
  }
}

async function loadRepos(serverId: string): Promise<void> {
  loadingRepos.value = true
  gitError.value = ''
  try {
    const res = await listGitServerRepos(serverId, 1, 100)
    availableRepos.value = res.data?.repositories ?? []
  } catch (err: any) {
    availableRepos.value = []
    gitError.value = err?.message || '仓库列表加载失败'
  } finally {
    loadingRepos.value = false
  }
}

async function handleGitServerChange(event: Event): Promise<void> {
  selectedGitServerId.value = (event.target as HTMLSelectElement).value
  selectedRepoFullName.value = ''
  availableRepos.value = []
  if (selectedGitServerId.value) await loadRepos(selectedGitServerId.value)
}

async function browse(path: string): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await browseProjectDirectories({
      path,
      server_id: serverId.value,
      show_hidden: showHidden.value,
      limit: 300,
    })
    currentPath.value = res.data?.path || path
    pathInput.value = currentPath.value
    parentPath.value = res.data?.parent ?? null
    pathWritable.value = Boolean(res.data?.writable)
    pathIsGitRepo.value = Boolean(res.data?.is_git_repo)
    entries.value = res.data?.entries ?? []
    if (projectNameAuto.value || !projectName.value.trim()) {
      projectName.value = inferName(currentPath.value)
      projectNameAuto.value = true
    }
  } catch (err: any) {
    error.value = err?.message || '目录浏览失败'
  } finally {
    loading.value = false
  }
}

async function submitPathInput(): Promise<void> {
  const next = pathInput.value.trim()
  if (!next || next === currentPath.value || loading.value) return
  await browse(next)
}

async function toggleHidden(event: Event): Promise<void> {
  showHidden.value = (event.target as HTMLInputElement).checked
  if (currentPath.value) await browse(currentPath.value)
}

async function handleCreate(): Promise<void> {
  if (!canCreate.value) return
  creating.value = true
  error.value = ''
  try {
    const payload: CreateProjectRequest = {
      name: projectName.value.trim(),
      description: description.value.trim() || undefined,
      project_root: currentPath.value,
      workspace_path: currentPath.value,
      metadata: {
        workspace_path: currentPath.value,
        project_root: currentPath.value,
        directory_source: serverId.value,
      },
    }
    if (selectedGitServerId.value) {
      payload.git_server_id = selectedGitServerId.value
      if (selectedRepoFullName.value) {
        const [owner, ...repoParts] = selectedRepoFullName.value.split('/')
        const repo = repoParts.join('/')
        payload.git_repository = selectedRepoFullName.value
        if (owner && repo) {
          payload.git_owner = owner
          payload.git_repo_name = repo
        } else {
          payload.git_repo_name = selectedRepoFullName.value
        }
      }
    }
    const res = await createProject(payload)
    emit('created', res.data)
    emit('update:open', false)
  } catch (err: any) {
    error.value = err?.message || '目录创建失败'
  } finally {
    creating.value = false
  }
}

function handleProjectNameInput(event: Event): void {
  projectName.value = (event.target as HTMLInputElement).value
  projectNameAuto.value = !projectName.value.trim()
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
    <section class="flex h-[min(720px,82vh)] w-[min(980px,92vw)] overflow-hidden rounded-[24px] border border-cyan-200/15 bg-[#0b1518] text-white shadow-2xl">
      <aside class="flex w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.025] p-4">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <div class="text-xs tracking-[0.18em] text-cyan-200/45">目录</div>
            <div class="mt-1 text-lg font-semibold">选择目录</div>
          </div>
          <button class="rounded-full p-2 text-white/45 hover:bg-white/10 hover:text-white" @click="$emit('update:open', false)">
            <X class="h-4 w-4" />
          </button>
        </div>

        <label class="mb-2 text-xs text-white/45">服务器</label>
        <div class="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <Server class="h-4 w-4 text-cyan-200/65" />
          <select v-model="serverId" class="min-w-0 flex-1 bg-transparent text-sm text-white/80 outline-none">
            <option v-for="server in servers" :key="server.id" :value="server.id" class="bg-[#11191c] text-white">
              {{ server.name }}
            </option>
          </select>
        </div>
        <div class="mb-3 text-xs text-white/35">
          {{ selectedServer?.kind || 'manager' }} · {{ selectedServer?.can_browse ? '可浏览' : '不可浏览' }}
        </div>

        <div class="mb-2 text-xs text-white/45">快捷位置</div>
        <div class="space-y-1 overflow-y-auto">
          <button
            v-for="root in roots"
            :key="root.id"
            class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white/65 hover:bg-white/10 hover:text-white"
            @click="browse(root.path)"
          >
            <Folder class="h-4 w-4 shrink-0 text-cyan-200/55" />
            <span class="min-w-0 flex-1 truncate">{{ root.name }}</span>
          </button>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4">
          <button
            class="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-35"
            :disabled="!parentPath || loading"
            title="去上级目录"
            @click="parentPath && browse(parentPath)"
          >
            <ChevronLeft class="h-4 w-4" />
            上级
          </button>
          <input
            v-model="pathInput"
            class="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-cyan-50/75 outline-none focus:border-cyan-200/45"
            :placeholder="currentPath || '输入目录路径...'"
            :disabled="loading"
            spellcheck="false"
            @keydown.enter.prevent="submitPathInput"
            @blur="submitPathInput"
          />
          <label class="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-white/50">
            <input :checked="showHidden" type="checkbox" class="accent-cyan-300" @change="toggleHidden" />
            隐藏目录
          </label>
        </header>

        <main class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
          <div class="min-h-0 overflow-y-auto p-4">
            <div v-if="loading" class="flex h-full items-center justify-center text-white/45">
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              读取目录
            </div>
            <div v-else-if="error" class="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {{ error }}
            </div>
            <div v-else class="space-y-1.5">
              <button
                v-if="parentPath"
                class="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-cyan-200/18 bg-cyan-200/[0.055] px-3 py-2.5 text-left hover:border-cyan-200/38 hover:bg-cyan-200/12"
                title="去上级目录"
                @click="browse(parentPath)"
              >
                <CornerUpLeft class="h-4 w-4 shrink-0 text-cyan-200/80" />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold text-cyan-50/86">.. 上级目录</div>
                  <div class="mt-0.5 break-all font-mono text-[10px] leading-4 text-white/35">{{ parentPath }}</div>
                </div>
              </button>
              <button
                v-for="entry in entries"
                :key="entry.path"
                class="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left hover:border-cyan-200/35 hover:bg-cyan-200/10"
                @click="browse(entry.path)"
              >
                <FolderOpen class="h-4 w-4 shrink-0 text-cyan-200/70" />
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <div class="min-w-0 flex-1 break-all text-sm leading-5 text-white/80 group-hover:text-white">{{ entry.name }}</div>
                  <div class="flex shrink-0 gap-2 text-[10px] text-white/35">
                    <span v-if="entry.is_git_repo">git</span>
                    <span>{{ entry.writable ? 'writable' : 'read only' }}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <aside class="overflow-y-auto border-l border-white/10 bg-black/15 p-5">
            <div class="mb-4">
              <div class="text-xs tracking-[0.18em] text-cyan-200/45">添加</div>
              <h2 class="mt-1 text-xl font-semibold">新目录</h2>
            </div>
            <label class="mb-1 block text-xs text-white/45">目录名称</label>
            <input
              :value="projectName"
              class="mb-3 h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-cyan-200/45"
              placeholder="目录名称"
              @input="handleProjectNameInput"
            />
            <label class="mb-1 block text-xs text-white/45">描述</label>
            <textarea
              v-model="description"
              class="mb-4 h-24 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-cyan-200/45"
              placeholder="可选"
            />
            <div class="mb-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs text-white/45">
              <div class="mb-1 text-white/65">当前目录</div>
              <div class="break-all font-mono">{{ currentPath }}</div>
              <div class="mt-2 flex gap-2">
                <span>{{ pathWritable ? '可写' : '只读' }}</span>
                <span v-if="pathIsGitRepo">Git 仓库</span>
              </div>
            </div>
            <div class="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
              <div class="mb-3 flex items-center gap-2 text-sm font-medium text-white/80">
                <GitBranch class="h-4 w-4 text-cyan-200/70" />
                Git Token
              </div>
              <label class="mb-1 block text-xs text-white/45">Gitea / Git Server</label>
              <select
                :value="selectedGitServerId"
                class="mb-3 h-10 w-full rounded-xl border border-white/10 bg-[#0f1a1d] px-3 text-sm text-white/80 outline-none focus:border-cyan-200/45 disabled:opacity-45"
                :disabled="gitServersLoading"
                data-testid="voice-directory-create-git-server"
                @change="handleGitServerChange"
              >
                <option value="">{{ gitServersLoading ? '读取 Git Server...' : '不关联 Git Token' }}</option>
                <option
                  v-for="server in gitServers"
                  :key="server.server_id"
                  :value="server.server_id"
                  :disabled="!server.token_valid"
                >
                  {{ server.name }} · {{ server.platform_type }}{{ server.token_valid ? '' : ' · token 无效' }}
                </option>
              </select>

              <label class="mb-1 block text-xs text-white/45">仓库</label>
              <select
                v-model="selectedRepoFullName"
                class="h-10 w-full rounded-xl border border-white/10 bg-[#0f1a1d] px-3 text-sm text-white/80 outline-none focus:border-cyan-200/45 disabled:opacity-45"
                :disabled="!selectedGitServerId || loadingRepos"
                data-testid="voice-directory-create-git-repo"
              >
                <option value="">{{ loadingRepos ? '读取仓库...' : '不绑定具体仓库' }}</option>
                <option v-for="repo in availableRepos" :key="repo.full_name" :value="repo.full_name">
                  {{ repo.full_name }}
                </option>
              </select>
              <div v-if="gitError" class="mt-2 text-xs text-red-200">{{ gitError }}</div>
              <div v-else class="mt-2 text-xs text-white/35">
                Token 仍由 Git Server 加密保存；目录只保存引用和仓库名。
              </div>
            </div>
            <button
              class="sticky bottom-0 z-10 mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-cyan-300 font-medium text-black shadow-[0_-14px_26px_rgba(7,16,18,0.92)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="!canCreate"
              @click="handleCreate"
            >
              <Loader2 v-if="creating" class="h-4 w-4 animate-spin" />
              <Check v-else class="h-4 w-4" />
              添加目录
            </button>
          </aside>
        </main>
      </div>
    </section>
  </div>
</template>
