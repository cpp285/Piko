"use client"
import { tr, trNode, useLocale } from "@/lib/ui-language";


import { APP_VERSION } from '@/lib/appMeta'
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface BottomToolbarProps {
  editMode: boolean
  onToggleEditMode: () => void
  onOpenSettings: () => void
  onOpenWorkbench?: () => void
  onToggleFollow?: () => void
  followActive?: boolean
  canFollow?: boolean
  onOpenHistory?: () => void
  onOpenSceneSwitcher?: () => void
  onToggleTest?: () => void
  testActive?: boolean
  showEditorControls?: boolean
}

function TipButton({
  label,
  tip,
  className,
  onClick,
}: {
  label: string
  tip: string
  className: string
  onClick: () => void
}) {
  useLocale();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className={className} onClick={onClick}>
          {trNode(label)}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{trNode(tip)}</TooltipContent>
    </Tooltip>
  )
}

export default function BottomToolbar({ editMode, onToggleEditMode, onOpenSettings, onOpenHistory, onOpenWorkbench, onToggleFollow, followActive, canFollow, onOpenSceneSwitcher, onToggleTest, testActive, showEditorControls = true }: BottomToolbarProps) {
  useLocale();
  return (
    <div className="btb">
      {onOpenWorkbench && <TipButton label={tr("协作工作台")} tip={tr("任务看板、成员状态、协作关系与工作回顾")} className="btb-btn" onClick={onOpenWorkbench} />}
      {onToggleFollow && canFollow && <TipButton label={tr(followActive ? "停止跟随" : "跟随成员")} tip={tr("镜头跟随当前选中的成员")} className={followActive ? "btb-btn btb-btn-active" : "btb-btn"} onClick={onToggleFollow} />}
      {onOpenSceneSwitcher && (
        <TipButton
          label={tr("Office")}
          tip={tr("Switch office appearance")}
          className="btb-btn"
          onClick={onOpenSceneSwitcher}
        />
      )}
      {showEditorControls && (
        <TipButton
          label={tr("Layout")}
          tip={tr("Edit office layout")}
          className={editMode ? "btb-btn btb-btn-active" : "btb-btn"}
          onClick={onToggleEditMode}
        />
      )}
      {onOpenHistory && (
        <TipButton
          label={tr("History")}
          tip={tr("Project history")}
          className="btb-btn"
          onClick={onOpenHistory}
        />
      )}
      <TipButton
        label={tr("Settings")}
        tip={tr(`Settings \u00b7 Web UI v${APP_VERSION}`)}
        className="btb-btn"
        onClick={onOpenSettings}
      />
      {onToggleTest && (
        <TipButton
          label={tr(testActive ? 'Clear Test' : 'Test')}
          tip={tr("Fill all work seats with test characters")}
          className={testActive ? "btb-btn btb-btn-danger" : "btb-btn"}
          onClick={onToggleTest}
        />
      )}
    </div>
  )
}
