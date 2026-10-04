'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Bell, Folder, MessageCircle, Plus, Search, Settings2, Users, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { nanoid } from 'nanoid';
import type { WorkroomAction, WorkroomConversation, WorkroomMember } from '@piko/shared';
import { useOfficeStore, folderPickCallbacks } from '@/store/office-store';
import { workroomRequest } from '@/lib/workroom-client';
import { sendCommand } from '@/lib/connection';
import { tr, useLocale } from '@/lib/ui-language';
import LegacyMessengerWorkspace, { type MessengerProps } from './LegacyMessengerWorkspace';
import { buildConversationGroups } from './conversation-model';
import type { AgentData } from './MultiPaneView';
import SpriteAvatar from './SpriteAvatar';
import MemberSettingsModal from './MemberSettingsModal';
import CreateAgentModal from './CreateAgentModal';
import TermModal from './primitives/TermModal';
import s from './PersonalWorkspace.module.css';

export default function MessengerWorkspace(props: MessengerProps) {
  const locale = useLocale(); const t = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const snapshot = useOfficeStore(state => state.workroom);
  const defs = useOfficeStore(state => state.agentDefs);
  const projects = useOfficeStore(state => state.projects);
  const [selected, setSelected] = useState('');
  const [directory, setDirectory] = useState(false); const [search, setSearch] = useState('');
  const [settings, setSettings] = useState<WorkroomMember | null>(null);
  const [editingRoom, setEditingRoom] = useState<WorkroomConversation | 'new' | null>(null);
  const [creatingMember, setCreatingMember] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [sending, setSending] = useState(false);
  const feed = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null); const away = useRef(false);
  const oldMembers = props.openPanes.map(id => props.getAgentData(id)).filter((a): a is AgentData => !!a);
  const oldGroups = buildConversationGroups(oldMembers);
  const oldDirects = oldMembers.filter(m => !m.teamId && !m.isExternal && m.messages.length > 0);
  const room = snapshot.conversations.find(r => r.id === selected);
  const legacyId = selected.startsWith('legacy:') ? `group:${selected.slice(7)}` : selected.startsWith('legacy-agent:') ? `agent:${selected.slice(13)}` : !selected && oldGroups[0] ? `group:${oldGroups[0].id}` : null;
  const member = (key: string) => snapshot.members.find(m => m.key === key);
  const draft = drafts[selected] ?? '';
  const busy = room?.messages.some(m => m.state === 'working') ?? false;
  const avatar = (person: WorkroomMember | undefined, small = false) => <span className={small ? s.smallAvatar : s.avatar}><SpriteAvatar palette={person?.palette ?? 0} zoom={small ? 1 : 1.5} ready={props.assetsReady} /></span>;
  const roomAvatar = (r: WorkroomConversation) => r.kind === 'direct' ? avatar(member(r.memberKeys[0])) : <span className={s.groupAvatar}>{r.memberKeys.slice(0, 4).map(k => <span key={k}>{avatar(member(k), true)}</span>)}</span>;
  const open = (id: string) => { setSelected(id); setDirectory(false); setMobileOpen(true); setError(''); away.current = false; };
  const request = async (action: WorkroomAction) => { if (!props.connected) throw new Error('连接已断开，请等待重新连接。'); return workroomRequest(action); };
  const startDirect = async (person: WorkroomMember) => {
    setError(''); try { const result = await request({ op: 'create', kind: 'direct', name: person.name, memberKeys: [person.key], folder: null }); if (result.conversationId) open(result.conversationId); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { if (props.connected && props.isOwner) void workroomRequest({ op: 'sync' }).catch(e => setError(e.message)); }, [props.connected, props.isOwner, defs, props.openPanes.length]);
  const latest = room?.messages.at(-1);
  useEffect(() => { if (room && !directory && document.visibilityState === 'visible' && props.connected && room.messages.some(m => m.sender !== 'user' && m.timestamp > room.readAt)) void workroomRequest({ op: 'read', conversationId: room.id }).catch(() => {}); }, [room?.id, room?.updatedAt, latest?.timestamp, props.connected, directory]);
  useEffect(() => { if (feed.current && !away.current) feed.current.scrollTop = feed.current.scrollHeight; }, [room?.id, latest?.text, latest?.details, room?.messages.length]);
  const send = async () => {
    if (!room || busy || sending || !draft.trim()) return;
    setSending(true); setError(''); try { await request({ op: 'send', conversationId: room.id, text: draft, messageId: nanoid() }); setDrafts(d => ({ ...d, [room.id]: '' })); away.current = false; } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  };
  const match = (value: string) => value.toLowerCase().includes(search.toLowerCase().trim());
  const groupName = (id: string) => [...projects.values()].find(p => p.teamId === id)?.name || t('原有工作群', 'Existing work group');
  if (!props.isOwner) return <LegacyMessengerWorkspace {...props} />;
  return <div className={s.workspace} data-chat-open={mobileOpen}>
    <aside className={s.sidebar} aria-label={t('会话列表', 'Conversations')}>
      <div className={s.sideHeader}><h2>{t('消息', 'Messages')}</h2><button onClick={() => setEditingRoom('new')} aria-label={t('新建群聊', 'New group')}><Plus size={20} /></button></div>
      <button className={s.directoryButton} onClick={() => { setDirectory(true); setMobileOpen(true); setError(''); }}><Users size={18} /><span>{t('全部成员', 'All people')}</span><small>{snapshot.members.length}</small><Settings2 size={15} /></button>
      <label className={s.search}><Search size={16} /><input aria-label={t('搜索会话', 'Search conversations')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('搜索会话', 'Search conversations')} /></label>
      <nav className={s.conversations}>
        {snapshot.conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt).filter(r => match(r.name)).map(r => { const last = r.messages.at(-1); const unread = r.id !== selected && r.messages.some(m => m.sender !== 'user' && m.timestamp > r.readAt); return <button key={r.id} className={s.conversation} aria-current={!directory && selected === r.id ? 'true' : undefined} onClick={() => open(r.id)}>{roomAvatar(r)}<span><strong>{r.name}{r.kind === 'group' && <small> {r.memberKeys.length}</small>}</strong><p>{last?.state === 'working' ? t('正在处理…', 'Working…') : last?.text.slice(0, 70) || (r.kind === 'group' ? t('开始群聊', 'Start a group conversation') : t('开始聊天', 'Start chatting'))}</p></span>{unread && <i className={s.unread} aria-label={t('未读消息', 'Unread message')} />}</button>; })}
        {oldGroups.filter(g => match(groupName(g.id))).map(g => <button className={s.conversation} key={g.id} aria-current={!directory && legacyId === `group:${g.id}` ? 'true' : undefined} onClick={() => open(`legacy:${g.id}`)}><span className={s.groupAvatar}><Users size={25} /></span><span><strong>{groupName(g.id)} <small>{g.members.length}</small></strong><p>{t('已有团队的工作与交付记录', 'Team work and delivery history')}</p></span></button>)}
        {oldDirects.filter(person => match(person.name)).map(person => <button className={s.conversation} key={person.agentId} aria-current={legacyId === `agent:${person.agentId}` ? 'true' : undefined} onClick={() => open(`legacy-agent:${person.agentId}`)}>{avatar(snapshot.members.find(m => m.target.kind === 'agent' && m.target.id === person.agentId))}<span><strong>{person.name}</strong><p>原有私聊记录</p></span></button>)}
        {!snapshot.conversations.length && !oldGroups.length && !oldDirects.length && <p className={s.muted}>{t('从全部成员发起私聊，或创建一个群。', 'Start a direct conversation from All people, or create a group.')}</p>}
      </nav>
      <div className={s.sideFooter}><button onClick={() => setEditingRoom('new')}><Plus size={16} />{t('新建群聊', 'New group')}</button><button onClick={() => { setDirectory(true); setMobileOpen(true); }}><MessageCircle size={16} />{t('发起私聊', 'New chat')}</button></div>
    </aside>
    <main className={s.main}>
      {directory ? <>
        <header className={s.header}><div><button className={s.back} onClick={() => { setDirectory(false); setMobileOpen(false); }} aria-label="返回会话列表"><ArrowLeft size={20} /></button><div><h2>{t('全部成员', 'All people')}</h2><p>{t('挑选一起工作的人，为每个人设置专长与资料。', 'Choose your people and set up their skills and knowledge.')}</p></div></div><button onClick={() => setCreatingMember(true)}><Plus size={16} />{t('新建人物', 'New person')}</button></header>
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.directory}>
          {snapshot.members.map(person => <article className={s.memberCard} key={person.key}><div>{avatar(person)}<div><h3>{person.name}</h3><p>{tr(person.role.split(/[—–]/)[0].trim())}</p></div></div><div className={s.memberFacts}><span>{snapshot.settings[person.key]?.skills.length ?? 0} 项技能</span><span>{snapshot.settings[person.key]?.knowledge.length ?? 0} 份资料</span>{snapshot.settings[person.key]?.proactive.enabled && <span><Bell size={12} />主动联系</span>}</div><footer><button aria-label={`${person.name} 成员设置`} onClick={() => setSettings(person)}><Settings2 size={15} />设置</button><button className={s.primary} onClick={() => void startDirect(person)} disabled={!props.connected}>开始私聊</button></footer></article>)}
          {!snapshot.members.length && <p className={s.muted}>{props.connected ? '正在加载成员…' : '连接恢复后显示全部成员。'}</p>}
        </div>
      </> : room ? <>
        <header className={s.header}><div><button className={s.back} aria-label="返回会话列表" onClick={() => setMobileOpen(false)}><ArrowLeft size={20} /></button>{roomAvatar(room)}<div><h2>{room.name}{room.kind === 'group' && <small>（{room.memberKeys.length}）</small>}</h2><p>{room.folder ? room.folder : t('随时聊聊，也可以一起做事', 'Talk, think, and work together')}</p></div></div><div className={s.headerActions}>{room.kind === 'direct' && member(room.memberKeys[0]) && <button onClick={() => setSettings(member(room.memberKeys[0])!)}><Settings2 size={16} />成员设置</button>}<button aria-label={room.kind === 'group' ? '群聊设置' : '会话设置'} onClick={() => setEditingRoom(room)}><Folder size={16} />{room.kind === 'group' ? '群聊设置' : '会话设置'}</button></div></header>
        {room.kind === 'group' && <div className={s.memberStrip}>{room.memberKeys.map(key => <button key={key} onClick={() => { const person = member(key); if (person) setSettings(person); }}>{avatar(member(key), true)}{member(key)?.name || '已移除成员'}{key === room.coordinator && <small>协调</small>}</button>)}</div>}
        {!props.connected && <p className={s.error}>连接已断开，正在重连。草稿已保留。</p>}
        <div className={s.feed} ref={feed} onScroll={e => { const el = e.currentTarget; away.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100; }}>
          {!room.messages.length && <div className={s.chatEmpty}><MessageCircle size={32} /><h3>{room.kind === 'group' ? '人齐了，开始聊吧' : `和${room.name}聊点什么？`}</h3><p>{room.kind === 'group' ? '可以 @ 指定成员，也可以交给协调成员接话。' : '不用准备项目目录，直接发消息就好。需要处理文件时再关联文件夹。'}</p></div>}
          {room.messages.map(message => <article key={message.id} className={s.message} data-own={message.sender === 'user'}>
            {message.sender !== 'user' && <button className={s.avatarButton} aria-label={`设置 ${member(message.sender)?.name || '成员'}`} onClick={() => { const person = member(message.sender); if (person) setSettings(person); }}>{avatar(member(message.sender))}</button>}
            <div className={s.messageBody}><div className={s.messageMeta}><strong>{message.sender === 'user' ? '我' : member(message.sender)?.name || (message.sender === 'system' ? '系统' : '成员')}</strong><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{message.proactive && <span><Bell size={11} />主动联系</span>}</div><div className={s.bubble} data-state={message.state}><ReactMarkdown components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>{message.text || (message.state === 'working' ? '正在思考与处理…' : '本轮已结束')}</ReactMarkdown>{message.state === 'working' && <span className={s.working}>处理中</span>}{message.state === 'cancelled' && <small>已停止</small>}
            {message.approval && <div className={s.approval}><strong>{message.approval.title}</strong><p>{message.approval.summary}</p>{(['no', 'yes'] as const).map(decision => <button key={decision} onClick={() => void request({ op: 'approval', conversationId: room.id, approvalId: message.approval!.id, decision }).catch(e => setError(e.message))}>{decision === 'yes' ? '允许' : '拒绝'}</button>)}</div>}
            </div>{message.details && <details className={s.execution}><summary>查看执行过程</summary><pre>{message.details}</pre></details>}</div>
          </article>)}
        </div>
        <div className={s.composer}>
          {error && <p className={s.error} role="alert">{error}</p>}
          <div className={s.composerTools}><button onClick={() => setEditingRoom(room)}><Folder size={14} />{room.folder ? '已关联文件夹' : '关联文件夹（可选）'}</button>{room.kind === 'group' && <select aria-label="提及成员" value="" onChange={e => { if (e.target.value) { setDrafts(d => ({ ...d, [selected]: `${d[selected] || ''}@${e.target.value} ` })); input.current?.focus(); } }}><option value="">@ 提及成员</option>{room.memberKeys.map(k => <option key={k} value={member(k)?.name}>{member(k)?.name}</option>)}</select>}</div>
          <textarea ref={input} aria-label="聊天消息" value={draft} placeholder={room.kind === 'group' ? '聊聊想法，或 @ 一位成员一起做事…' : `给${room.name}发消息…`} onChange={e => setDrafts(d => ({ ...d, [selected]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send(); } }} />
          <div className={s.composerBottom}><span>Enter 发送 · Shift + Enter 换行</span>{busy ? <button onClick={() => void request({ op: 'cancel', conversationId: room.id }).catch(e => setError(e.message))}>停止本轮</button> : <button className={s.primary} disabled={!props.connected || !draft.trim() || sending} onClick={() => void send()}>发送<ArrowUp size={16} /></button>}</div>
        </div>
      </> : legacyId ? <div className={s.legacy}><LegacyMessengerWorkspace {...props} key={legacyId} embeddedSelection={legacyId} onBackToConversations={() => setMobileOpen(false)} /></div> : <div className={s.chatEmpty}><MessageCircle size={38} /><h2>找位搭档，开始聊聊</h2><p>选一个人私聊，或把几位成员拉进群。是否关联文件夹，由这次要做的事情决定。</p><button className={s.primary} onClick={() => { setDirectory(true); setMobileOpen(true); }}>查看全部成员</button></div>}
    </main>
    {settings && <MemberSettingsModal key={settings.key} member={settings} onClose={() => setSettings(null)} />}
    {editingRoom && <RoomEditor room={editingRoom === 'new' ? undefined : editingRoom} members={snapshot.members} connected={props.connected} onClose={() => setEditingRoom(null)} onSaved={id => { setEditingRoom(null); open(id); }} />}
    {creatingMember && <CreateAgentModal assetsReady={props.assetsReady} sendCommand={sendCommand} onClose={() => setCreatingMember(false)} onSave={() => setCreatingMember(false)} />}
  </div>;
}

function RoomEditor({ room, members, connected, onClose, onSaved }: { room?: WorkroomConversation; members: WorkroomMember[]; connected: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(room?.name || ''); const [keys, setKeys] = useState(room?.memberKeys || [] as string[]); const [coordinator, setCoordinator] = useState(room?.coordinator || ''); const [folder, setFolder] = useState(room?.folder || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = name !== (room?.name || '') || folder !== (room?.folder || '') || JSON.stringify(keys) !== JSON.stringify(room?.memberKeys || []) || coordinator !== (room?.coordinator || '');
  const close = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose(); };
  const folderRequest = useRef<string | null>(null);
  useEffect(() => () => { if (folderRequest.current) folderPickCallbacks.delete(folderRequest.current); }, []);
  const browse = () => { const requestId = nanoid(); folderRequest.current = requestId; folderPickCallbacks.set(requestId, result => setFolder(result)); sendCommand({ type: 'PICK_FOLDER', requestId }); };
  const save = async () => {
    setBusy(true); setError('');
    try { const result = await workroomRequest(room ? { op: 'update', conversationId: room.id, name: name.trim() || room.name, memberKeys: keys, coordinator: keys.includes(coordinator) ? coordinator : keys[0], folder: folder.trim() || null } : { op: 'create', kind: 'group', name: name.trim(), memberKeys: keys, coordinator: keys.includes(coordinator) ? coordinator : keys[0], folder: folder.trim() || null }); onSaved(result.conversationId!); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <TermModal open onClose={close} title={room ? room.kind === 'direct' ? '会话设置' : '群聊设置' : '新建群聊'} maxWidth={680} zIndex={125} className={s.modal} footer={<div className={s.modalFooter}><span>{confirmClose ? '有未保存的内容' : '文件夹可以随时添加或解除关联'}</span><div>{confirmClose ? <><button onClick={() => setConfirmClose(false)}>继续编辑</button><button onClick={onClose}>放弃并关闭</button></> : <><button onClick={close}>取消</button><button className={s.primary} disabled={!connected || busy || !keys.length} onClick={() => void save()}>{busy ? '保存中…' : room ? '保存' : '创建群聊'}</button></>}</div></div>}>
    {error && <p className={s.error} role="alert">{error}</p>}
    {room?.kind !== 'direct' && <><label className={s.field}>群聊名称<input value={name} maxLength={120} placeholder="例如：产品讨论、每周进度、内容创作" onChange={e => setName(e.target.value)} /></label><fieldset className={s.memberChoices}><legend>选择成员</legend>{members.map(person => <label key={person.key}><input type="checkbox" checked={keys.includes(person.key)} onChange={e => setKeys(old => e.target.checked ? [...old, person.key] : old.filter(k => k !== person.key))} /><span>{person.name}<small>{tr(person.role.split(/[—–]/)[0].trim())}</small></span></label>)}</fieldset><label className={s.field}>默认接话与协调<select value={keys.includes(coordinator) ? coordinator : keys[0] || ''} onChange={e => setCoordinator(e.target.value)}><option value="" disabled>选择一位成员</option>{keys.map(k => <option key={k} value={k}>{members.find(m => m.key === k)?.name}</option>)}</select></label><p className={s.help}>没有 @ 时由协调成员接话；@ 某位成员时，由被提及的成员处理。一个人可以参加多个群。</p></>}
    <label className={s.field}>关联文件夹（可选）<div className={s.folderField}><input value={folder} placeholder="不选择也能聊天" onChange={e => setFolder(e.target.value)} /><button onClick={browse}>选择</button>{folder && <button aria-label="解除文件夹关联" onClick={() => setFolder('')}><X size={15} /></button>}</div></label><p className={s.help}>聊天、讨论和构思可以留空。需要围绕本地文件工作时，再选择资料或项目目录。更换文件夹后保留聊天记录，并使用新的执行上下文。</p>
  </TermModal>;
}
