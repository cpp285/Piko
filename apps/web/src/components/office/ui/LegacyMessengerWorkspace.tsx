'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, AtSign, ChevronDown, ChevronRight, MessageCircle, Plus, Search, Users, X } from 'lucide-react';
import { tr, useLocale } from '@/lib/ui-language';
import { useOfficeStore, type TeamChatMessage } from '@/store/office-store';
import { StableAgentPane, type MultiPaneViewProps, type AgentData } from './MultiPaneView';
import SpriteAvatar from './SpriteAvatar';
import { buildConversationGroups, buildGroupEntries, groupRecipient, messageSummary, type ConversationGroup, type GroupEntry } from './conversation-model';
import styles from './MessengerWorkspace.module.css';
import AgentIdentityModal from './AgentIdentityModal';

export type MessengerProps = MultiPaneViewProps & {
  teamMessages: TeamChatMessage[];
  connected: boolean;
  onNewProject: () => void;
  onCreateTeam: () => void;
  embeddedSelection?: string;
  onBackToConversations?: () => void;
};

export default function LegacyMessengerWorkspace(props: MessengerProps) {
  const locale = useLocale();
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const projects = useOfficeStore(s => s.projects);
  const activeProjectId = useOfficeStore(s => s.activeProjectId);
  const setActiveProject = useOfficeStore(s => s.setActiveProject);
  const members = props.openPanes.map(id => props.getAgentData(id)).filter((a): a is AgentData => !!a);
  const groups = buildConversationGroups(members);
  const [selected, setSelected] = useState(props.embeddedSelection ?? '');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [identityPerson, setIdentityPerson] = useState<{ id: string; name: string } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fallback = groups[0] ? `group:${groups[0].id}` : members[0] ? `agent:${members[0].agentId}` : '';
  const validSelection = groups.some(g => selected === `group:${g.id}`) || members.some(a => selected === `agent:${a.agentId}`);
  const selection = validSelection ? selected : fallback;
  const group = groups.find(g => selection === `group:${g.id}`);
  const member = members.find(a => selection === `agent:${a.agentId}`);
  const leadId = group ? groupRecipient(group) : null;
  const lead = members.find(a => a.agentId === leadId);
  const draft = leadId ? props.panePrompts.get(leadId) ?? '' : '';
  const images = leadId ? props.panePendingImages.get(leadId) ?? [] : [];
  const meta = (id: string) => props.agentMeta?.find(m => m.agentId === id);
  const open = (key: string) => { setSelected(key); setMobileOpen(true); setMentionOpen(false); setSendError(''); };
  const openMember = (id: string) => open(`agent:${id}`);
  const groupName = (g: ConversationGroup) => [...projects.values()].find(p => p.teamId === g.id || p.agentIds.includes(g.lead?.agentId ?? g.members[0]?.agentId))?.name || members.find(a => a.agentId === g.lead?.agentId)?.workDir?.split('/').filter(Boolean).at(-1) || t('协作团队', 'Team');
  const status = (a: AgentData) => a.status === 'working' ? t('工作中', 'Working') : a.status === 'waiting_approval' || a.pendingApproval ? t('等待确认', 'Needs approval') : a.status === 'error' ? t('遇到问题', 'Needs attention') : t('待命', 'Available');
  const groupEntries = group ? buildGroupEntries(group, props.teamMessages) : [];
  const canSend = props.isOwner && props.connected && !!leadId && !sending;
  const send = async () => {
    if (!canSend || (!draft.trim() && !images.length)) return;
    setSending(true); setSendError(''); setMentionOpen(false);
    try { await props.onSubmit(leadId!); }
    catch { setSendError(t('发送失败，内容已保留，请重试。', 'Could not send. Your draft is saved; try again.')); }
    finally { setSending(false); }
  };
  const mention = (name: string) => {
    if (!leadId) return;
    const el = input.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? start;
    const before = draft.slice(0, start).replace(/@$/, '');
    const value = `${before}@${name} ${draft.slice(end)}`;
    props.onPanePromptChange(leadId, value);
    setMentionOpen(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length + name.length + 2, before.length + name.length + 2); });
  };
  const matches = (text: string) => !search.trim() || text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const avatar = (id: string, small = false) => <span className={small ? styles.smallAvatar : styles.avatar}><SpriteAvatar palette={meta(id)?.palette ?? 0} zoom={small ? 1 : 1.6} ready={props.assetsReady} /></span>;
  const groupAvatar = (g: ConversationGroup) => <span className={styles.groupAvatar}>{g.members.slice(0, 4).map(a => <span key={a.agentId}><SpriteAvatar palette={meta(a.agentId)?.palette ?? 0} zoom={0.8} ready={props.assetsReady} /></span>)}</span>;
  const currentMemberGroup = member?.teamId ? groups.find(g => g.id === member.teamId) : undefined;
  const activeProjects = [...projects.values()].filter(p => p.status === 'active');
  useEffect(() => { setMentionOpen(false); setSendError(''); }, [selection]);

  return <div className={styles.workspace} data-chat-open={mobileOpen || !!props.embeddedSelection} data-embedded={!!props.embeddedSelection} data-testid="messenger">
    {!props.embeddedSelection && <aside className={styles.sidebar} aria-label={t('会话列表', 'Conversations')}>
      <div className={styles.sidebarHeading}><h2>{t('消息', 'Messages')}</h2>{props.isOwner && <button className={styles.iconButton} onClick={props.onNewProject} title={t('新建项目', 'New project')} aria-label={t('新建项目', 'New project')}><Plus size={19} /></button>}</div>
      <div className={styles.search}><Search size={15} /><input aria-label={t('搜索会话', 'Search conversations')} placeholder={t('搜索团队或成员', 'Search teams or people')} value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} aria-label={t('清除搜索', 'Clear search')}><X size={14} /></button>}</div>
      <nav className={styles.conversations}>
        <div className={styles.listLabel}>{t('团队群聊', 'TEAM CHATS')}<span>{groups.length}</span></div>
        {groups.filter(g => matches(groupName(g) + g.members.map(a => a.name).join(' '))).map(g => {
          const latest = buildGroupEntries(g, props.teamMessages).at(-1);
          const busy = g.members.some(m => members.find(a => a.agentId === m.agentId)?.busy);
          return <button className={styles.conversation} aria-current={selection === `group:${g.id}` ? 'true' : undefined} key={g.id} onClick={() => open(`group:${g.id}`)}>
            {groupAvatar(g)}<span className={styles.rowText}><span className={styles.rowTitle}>{groupName(g)}<span className={styles.count}>{g.members.length}</span></span><span className={styles.preview}>{latest ? messageSummary(latest.text, 36) : t('一起开始第一个任务', 'Start your first task together')}</span></span>{busy && <span className={styles.activityDot} title={t('团队正在工作', 'Team is working')} />}
          </button>;
        })}
        {!groups.length && <p className={styles.listEmpty}>{t('组建团队后，群聊会出现在这里。', 'Create a team to start a group chat.')}</p>}
        <div className={styles.listLabel}>{t('成员会话', 'PEOPLE')}<span>{members.length}</span></div>
        {members.filter(a => matches(a.name + ' ' + tr(a.role ?? ''))).map(a => <button key={a.agentId} className={styles.conversation} aria-current={selection === `agent:${a.agentId}` ? 'true' : undefined} onClick={() => openMember(a.agentId)}>
          {avatar(a.agentId)}<span className={styles.rowText}><span className={styles.rowTitle}>{a.name}{a.isTeamLead && <span className={styles.leadTag}>{t('负责人', 'Lead')}</span>}</span><span className={styles.preview}>{tr(a.role?.split('—')[0].trim() ?? '')}{a.role ? ' · ' : ''}{status(a)}</span></span>{(a.busy || a.pendingApproval) && <span className={styles.activityDot} data-waiting={!!a.pendingApproval || a.status === 'waiting_approval'} />}
        </button>)}
        {search && !members.some(a => matches(a.name + ' ' + tr(a.role ?? ''))) && !groups.some(g => matches(groupName(g) + g.members.map(a => a.name).join(' '))) && <p className={styles.listEmpty}>{t('没有找到相关会话', 'No conversations found')}</p>}
      </nav>
      {props.isOwner && <div className={styles.sidebarFooter}>
        {activeProjects.length > 0 && <label className={styles.projectPicker}><span>{t('当前项目', 'Current project')}</span><select aria-label={t('当前项目', 'Current project')} value={activeProjectId ?? ''} onChange={e => setActiveProject(e.target.value)}><option value="" disabled>{t('选择项目', 'Choose project')}</option>{activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <div className={styles.createActions}><button onClick={props.onCreateTeam}><Users size={15} />{t('组建团队', 'Create team')}</button><button onClick={props.onHire}><Plus size={15} />{t('添加成员', 'Add agent')}</button></div>
      </div>}
    </aside>}

    <section className={styles.chat} aria-label={group ? t('团队群聊', 'Team chat') : member?.name ?? t('聊天', 'Chat')}>
      <header className={styles.chatHeader} data-testid="chat-header">
        <div className={styles.headingMain}>
          <button className={`${styles.iconButton} ${styles.backButton}`} onClick={() => props.onBackToConversations ? props.onBackToConversations() : setMobileOpen(false)} aria-label={t('返回会话列表', 'Back to conversations')}><ArrowLeft size={20} /></button>
          {group ? groupAvatar(group) : member ? avatar(member.agentId) : <MessageCircle size={24} />}
          <div className={styles.headingText}><h2>{group ? groupName(group) : member?.name ?? t('团队聊天', 'Team chat')}{group && <span className={styles.headingCount}>({group.members.length})</span>}</h2><p>{group ? t('群里看协作动态，单聊看具体工作', 'Team updates here. Detailed work in each conversation.') : member ? `${tr(member.role ?? '')} · ${status(member)}` : t('把想法交给团队，一起完成', 'Bring an idea. Build it together.')}</p></div>
        </div>
        <div className={styles.headerActions}>
          {group && props.isOwner && <><button onClick={props.onAddTeamMembers}><Plus size={15} />{t('添加团队成员', 'Add members')}</button><button onClick={props.onStopTeam} disabled={!props.connected || !group.members.some(a => members.find(m => m.agentId === a.agentId)?.busy)}>{t('停止', 'Stop')}</button><details className={styles.menu}><summary aria-label={t('团队操作', 'Team actions')}>{t('更多', 'More')}<ChevronDown size={14} /></summary><div>{lead && !lead.busy && <button onClick={() => props.onEndProject(lead.agentId)}>{t('结束项目', 'End project')}</button>}<button className={styles.danger} onClick={props.onFireTeam}>{t('移除团队', 'Remove team')}</button></div></details></>}
          {member && props.isOwner && <button onClick={() => setIdentityPerson({ id: member.agentId, name: member.name })}>{t('身份设定', 'Identity settings')}</button>}
          {currentMemberGroup && <button onClick={() => open(`group:${currentMemberGroup.id}`)}><Users size={15} />{t('返回群聊', 'Team chat')}</button>}
        </div>
      </header>
      {!props.connected && <div className={styles.notice} role="status">{t('连接已断开，正在重连。连接恢复后可发送消息。', 'Disconnected. Reconnecting before you can send messages.')}</div>}
      {group ? <>
        <div className={styles.memberStrip}><Users size={14} /><span>{t('群成员', 'Members')}</span>{group.members.map(a => <button key={a.agentId} onClick={() => openMember(a.agentId)}>{avatar(a.agentId, true)}{a.name}{a.isTeamLead && <span className={styles.leadDot}>{t('负责人', 'Lead')}</span>}</button>)}</div>
        <GroupFeed key={group.id} entries={groupEntries} locale={locale} avatar={avatar} onOpenMember={openMember} />
        <div className={styles.decisions}>
          {!props.isSpectator && props.suggestions.slice(-3).map((s, i) => <div className={styles.suggestion} key={`${s.timestamp}-${i}`}><strong>{s.author} · {t("建议", "Suggestion")}</strong><span>{s.text}</span></div>)}
          {group.members.map(a => members.find(m => m.agentId === a.agentId)).filter(a => a?.pendingApproval || a?.awaitingApproval || a?.status === 'waiting_approval' || a?.status === 'error').map(a => a && <div className={styles.decision} key={a.agentId}><span>{a.name} · {a.status === 'error' ? t('任务遇到问题', 'Task needs attention') : t('有操作需要你确认', 'An action needs your approval')}</span><button onClick={() => openMember(a.agentId)}>{t('查看详情', 'Review details')}<ChevronRight size={14} /></button></div>)}
          {lead?.teamPhase === 'design' && !lead.busy && <div className={styles.decision}><span>{t('方案已就绪，确认后开始分派任务', 'Plan ready. Approve it to start delegation.')}</span><button onClick={() => openMember(lead.agentId)}>{t('查看方案', 'View plan')}</button>{props.isOwner && <button disabled={!props.connected} onClick={() => props.onApprovePlan(lead.agentId)}>{t('确认并开始', 'Approve & start')}</button>}</div>}
        </div>
        {props.isOwner ? <div className={styles.composer} onPaste={e => { if (leadId) props.onPasteImage(leadId, e); }} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (leadId) props.onDropImage(leadId, e); }}>
          <div className={styles.composerTools}><button disabled={!leadId} className={styles.mentionButton} onClick={() => setMentionOpen(v => !v)} aria-expanded={mentionOpen} aria-label={t('提及成员', 'Mention a member')}><AtSign size={17} /><span>{t('提及成员', 'Mention')}</span></button><span>{lead ? `${t('由', 'Coordinated by')} ${lead.name} ${t('统一协调与分派', '')}` : t('团队缺少负责人，暂时无法发送任务', 'No team lead available')}</span></div>
          {mentionOpen && <div className={styles.mentionMenu} aria-label={t('选择要提及的成员', 'Choose a member to mention')}>{group.members.map(a => <button key={a.agentId} onClick={() => mention(a.name)}>{avatar(a.agentId, true)}<span>@{a.name}</span><small>{a.isTeamLead ? t('负责人', 'Lead') : tr(members.find(m => m.agentId === a.agentId)?.role ?? '')}</small></button>)}</div>}
          {images.length > 0 && <div className={styles.attachments}>{images.map((img, i) => <div key={i}><img src={img.dataUrl} alt={img.name} /><button aria-label={t('移除图片', 'Remove image')} onClick={() => props.onPanePendingImagesChange(leadId!, images.filter((_, j) => i !== j))}><X size={12} /></button></div>)}</div>}
          <textarea ref={input} aria-label={t('发送到团队群聊', 'Message the team')} placeholder={t('说说接下来要做什么，也可以 @ 一位成员…', 'What should we work on next? You can @mention a teammate…')} value={draft} disabled={!leadId || sending} onChange={e => { props.onPanePromptChange(leadId!, e.target.value); if (e.target.value.slice(0, e.target.selectionStart).endsWith('@')) setMentionOpen(true); }} onPaste={e => { if (leadId) props.onPasteText(leadId, e); }} onKeyDown={e => {
            if (e.key === 'Escape') { setMentionOpen(false); return; }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); }
          }} />
          {sendError && <p className={styles.sendError} role="alert">{sendError}</p>}
          <div className={styles.composerBottom}><span>{t('Enter 发送 · Shift + Enter 换行 · 支持粘贴图片', 'Enter to send · Shift + Enter for a new line · Paste images')}</span><button className={styles.sendButton} onClick={() => void send()} disabled={!canSend || (!draft.trim() && !images.length)}>{sending ? t('发送中', 'Sending') : t('发送', 'Send')}<ArrowUp size={16} /></button></div>
        </div> : props.isCollaborator ? <form className={styles.composer} onSubmit={e => { e.preventDefault(); if (props.connected && props.suggestText.trim()) props.onSuggest(); }}><textarea aria-label={t('提出建议', 'Suggest an idea')} value={props.suggestText} onChange={e => props.onSuggestTextChange(e.target.value)} placeholder={t('向团队提出建议…', 'Suggest an idea to the team…')} maxLength={500} /><button className={styles.sendButton} disabled={!props.connected || !props.suggestText.trim()}>{t('发送建议', 'Send suggestion')}</button></form> : <div className={styles.readOnly}>{t('当前为只读模式', 'Read-only mode')}</div>}
      </> : member ? <>
        {currentMemberGroup && <div className={styles.detailHint}><span>{t('这里保留完整的任务、执行过程与交付记录。', 'Full tasks, execution details and deliverables appear here.')}</span><button onClick={() => { open(`group:${currentMemberGroup.id}`); const id = groupRecipient(currentMemberGroup); if (id) props.onPanePromptChange(id, `${props.panePrompts.get(id) ?? ''}@${member.name} `); }}>{t('在群里提及', 'Mention in group')}<AtSign size={13} /></button></div>}
        <div className={styles.directPane} data-testid="direct-chat"><StableAgentPane {...props} key={member.agentId} agentId={member.agentId} data={member} meta={undefined}
          reviewerOverlay={props.reviewOverlay?.sourceAgentId === member.agentId ? props.getReviewerData?.(props.reviewOverlay.reviewerAgentId) : null}
          onReviewerLoadMore={props.reviewOverlay?.sourceAgentId === member.agentId ? () => props.onReviewerLoadMore?.(props.reviewOverlay!.reviewerAgentId) : undefined}
          onApplyReviewFixes={props.reviewOverlay?.sourceAgentId === member.agentId ? props.onApplyReviewFixes : undefined}
          onDismissReview={props.reviewOverlay?.sourceAgentId === member.agentId ? props.onDismissReview : undefined}
        /></div>
      </> : <div className={styles.empty}><span className={styles.emptyIcon}><MessageCircle size={32} /></span><h3>{t('一起完成，下一个好想法', 'Your next idea starts here')}</h3><p>{t('创建一个团队，负责人、设计、产品和开发就在同一个群里协作。', 'Bring your lead, designer, product manager and developers into one chat.')}</p>{props.isOwner && <button className={styles.sendButton} onClick={props.onCreateTeam}>{t('组建我的团队', 'Create my team')}<Plus size={16} /></button>}</div>}
    </section>
    {identityPerson && <AgentIdentityModal target={{ kind: 'agent', id: identityPerson.id }} name={identityPerson.name} onClose={() => setIdentityPerson(null)} />}
  </div>;
}

function GroupFeed({ entries, locale, avatar, onOpenMember }: { entries: GroupEntry[]; locale: string; avatar: (id: string, small?: boolean) => React.ReactNode; onOpenMember: (id: string) => void }) {
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const [limit, setLimit] = useState(50);
  const [away, setAway] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previous = useRef({ height: 0, count: 0, limit });
  const visible = useMemo(() => entries.slice(-limit), [entries, limit]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (previous.current.limit !== limit) el.scrollTop += el.scrollHeight - previous.current.height;
    else if (nearBottom.current) el.scrollTop = el.scrollHeight;
    previous.current = { height: el.scrollHeight, count: entries.length, limit };
  }, [entries.length, limit]);
  const date = (ts: number) => new Date(ts).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric' });
  const kind = (entry: GroupEntry) => ({ delegation: t('分派任务', 'Assigned'), result: t('交付结果', 'Result'), status: t('进度更新', 'Update'), warning: t('需要关注', 'Attention'), user: '', update: t('负责人回复', 'Lead update') })[entry.kind];
  return <div className={styles.feedRegion}>
    <div className={styles.feed} ref={scroll} data-testid="group-feed" onScroll={() => { const el = scroll.current!; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAway(!nearBottom.current); }}>
      <div className={styles.feedInner}>
        {entries.length > limit && <button className={styles.loadMore} onClick={() => { previous.current.height = scroll.current?.scrollHeight ?? 0; setLimit(v => v + 50); }}>{t('查看更早的动态', 'Earlier updates')}</button>}
        {!entries.length && <div className={styles.groupWelcome}><Users size={28} /><h3>{t('团队已经就位', 'Your team is ready')}</h3><p>{t('在下方发送目标。负责人会在群里 @ 成员分派任务，成员完成后会把结果发回这里。', 'Send a goal below. Your lead will @mention teammates to assign tasks, and their results will appear here.')}</p></div>}
        {visible.map((entry, i) => <div key={entry.id}>
          {(i === 0 || date(visible[i - 1].timestamp) !== date(entry.timestamp)) && <div className={styles.dateDivider}>{date(entry.timestamp)}</div>}
          <article className={`${styles.message} ${entry.kind === 'user' ? styles.ownMessage : ''}`} data-kind={entry.kind}>
            {entry.kind === 'user' ? <span className={styles.userAvatar}>{t('我', 'Me')}</span> : <button className={styles.avatarButton} onClick={() => onOpenMember(entry.agentId)} aria-label={`${t('查看', 'Open')} ${entry.name}`}>{avatar(entry.agentId)}</button>}
            <div className={styles.messageContent}>
              <div className={styles.messageMeta}><span>{entry.kind === 'user' ? t('我', 'Me') : entry.name}</span><time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</time></div>
              <div className={styles.bubble}>
                {entry.kind !== 'user' && <div className={styles.eventHeading}><span className={styles.eventTag} data-kind={entry.kind}>{kind(entry)}</span>{entry.toName && <button className={styles.mentionLink} onClick={() => onOpenMember(entry.toAgentId!)}> @{entry.toName}</button>}</div>}
                <p>{messageSummary(entry.text, entry.kind === 'user' ? 500 : 220)}</p>
                {(entry.kind !== 'user' || entry.text.length > 500) && <button className={styles.detailsLink} onClick={() => onOpenMember(entry.detailAgentId)}>{entry.kind === 'delegation' ? t('查看执行会话', 'Open work conversation') : t('查看完整记录', 'View full details')}<ChevronRight size={13} /></button>}
              </div>
            </div>
          </article>
        </div>)}
      </div>
    </div>
    {away && <button className={styles.latest} onClick={() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }}>{t('回到最新动态', 'Latest updates')} ↓</button>}
  </div>;
}
