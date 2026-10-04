/** Recognize explicit approval of an existing plan, never arbitrary positive feedback.
 * Only call this for the owner's direct message while the leader is in design.
 */
export function isPlanApproval(prompt: string): boolean {
  const text = prompt.trim().toLowerCase();
  if (!text || text.length > 200) return false;
  // Questions, quoted examples, conditions, refusals and requested revisions stay in design.
  if (/[?？“”「」『』"`\n]/.test(text)
    || /(?:为什么|为何|怎么|能否|是否|能不能|可不可以|吗|么|如果|假如|要是|等.{0,30}再|先.{0,30}再|(?:执行|开发|实施|开始)(?:前|之前)|解释|讨论|考虑|不要|不能|别|暂不|还不|不行|不同意|不批准|不执行|不开始|不通过|不可以|修改|调整|改成|改一下|更改|补充|增加|删除|取消|暂停|等等|等一下)/.test(text)
    || /\b(?:not|don't|do not|wait|stop|cancel|if|unless|before|change|revise|modify|explain|why|how|can|could|would|should)\b/.test(text)) return false;

  const simple = text.replace(/[\s，,。.!！;；]+$/g, "");
  if (/^(?:好|好的|可以|行|没问题|同意|批准|通过|确认|就这样|ok|okay|yes|approved|approve|go ahead)$/.test(simple)) return true;
  if (/^(?:同意|批准|确认)(?:这个|当前)?(?:方案|计划)/.test(text)) return true;

  const instruction = text
    .replace(/^(?:好的?|可以|行|没问题|同意|批准|通过|确认|就这样)[\s，,。.!！;；]*/, "")
    .replace(/^(?:请|麻烦)?(?:你|大家|团队)?(?:现在|直接|马上|立即|就)?/, "");
  return /^(?:开始(?:执行|开发|实施|干活|做)|按(?:这个|当前|上面|上述|刚才)?(?:方案|计划)(?:开始)?(?:执行|开发|实施|做)|执行(?:这个|当前|上面|上述|刚才)?(?:方案|计划)|分配下去|分派下去|派发(?:任务|下去)|分配任务|安排(?:人|成员|团队|他们|大家)(?:去|开始)?(?:做|开发|执行|干活))/.test(instruction)
    || /^(?:please\s+)?(?:start (?:work|working|building|development|implementation|executing)|execute (?:the |this )?plan|approve (?:the |this )?plan|delegate (?:the )?tasks|go ahead(?: and (?:start|build|implement|execute|delegate))?)(?:\b|$)/.test(text);
}
