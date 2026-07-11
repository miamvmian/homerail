import type { GenerativeUiDevice, GenerativeUiSurface } from 'homerail-protocol'
import VoiceDynamicWidget from '@/components/agent/VoiceDynamicWidget.vue'
import SlideDeckWidget from '@/components/agent/widgets/SlideDeckWidget.vue'
import TopicOutlineWidget from '@/components/agent/widgets/TopicOutlineWidget.vue'
import XiaohongshuNoteWidget from '@/components/agent/widgets/XiaohongshuNoteWidget.vue'
import { adaptLegacyWidgetRenderer } from './legacy-widget-adapter'
import {
  GenerativeUiRendererRegistry,
  type GenerativeUiRendererMode,
  type GenerativeUiRendererRegistrationV1,
} from './renderer-registry'

const DEVICES: readonly GenerativeUiDevice[] = ['phone', 'desktop', 'tv']
const genericRenderer = adaptLegacyWidgetRenderer('CoreLegacyWidgetProjection', VoiceDynamicWidget)
const topicOutlineRenderer = adaptLegacyWidgetRenderer('TopicOutlineGenerativeUiRenderer', TopicOutlineWidget)
const xiaohongshuRenderer = adaptLegacyWidgetRenderer('XiaohongshuGenerativeUiRenderer', XiaohongshuNoteWidget)
const slideDeckRenderer = adaptLegacyWidgetRenderer('SlideDeckGenerativeUiRenderer', SlideDeckWidget)

function register(
  kind: string,
  surfaces: readonly GenerativeUiSurface[],
  component: GenerativeUiRendererRegistrationV1['component'],
  mode: GenerativeUiRendererMode,
): GenerativeUiRendererRegistrationV1[] {
  return surfaces.flatMap(surface => DEVICES.map(device => ({
    renderer_api_version: 1 as const,
    kind,
    kind_version: 1,
    surface,
    device,
    mode,
    component,
  })))
}

const registrations: GenerativeUiRendererRegistrationV1[] = [
  ...register('com.homerail.core/task_summary', ['task'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/notice', ['task', 'ambient'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/checklist', ['task'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/execution_progress', ['execution'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/execution_graph', ['execution'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/timeline', ['execution'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/metric_set', ['ambient', 'result'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/artifact', ['result'], genericRenderer, 'core_projection'),
  ...register('com.homerail.core/confirmation', ['task'], genericRenderer, 'core_projection'),
  ...register('com.homerail.content/topic_outline', ['task'], topicOutlineRenderer, 'specialized'),
  ...register('com.homerail.content/xiaohongshu_note', ['result'], xiaohongshuRenderer, 'specialized'),
  ...register('com.homerail.presentation/slide_deck', ['result'], slideDeckRenderer, 'specialized'),
  ...register('com.homerail.legacy/rich_content', ['result'], genericRenderer, 'core_projection'),
]

export const coreGenerativeUiRendererRegistry = new GenerativeUiRendererRegistry(registrations)
