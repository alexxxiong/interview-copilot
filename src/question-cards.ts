import type { Category, Job } from "./types";
import { interviewPrep, type PreparedAnswer } from "./interview-prep";

export type QuestionCard = {
  id: string;
  title: string;
  question: string;
  topic: string;
  category: Category;
  summary: string;
  tags: string[];
  cues: [string, string][];
  diagram: { title: string; nodes: [string, string][]; note: string };
  sources?: { title: string; url: string }[];
  profileHeading?: string;
  liveJob?: Job;
  prepared?: PreparedAnswer;
};
const raft = { title: "Raft 原始论文", url: "https://raft.github.io/raft.pdf" };
const fix = {
  title: "FIX 订单状态规范",
  url: "https://www.fixtrading.org/online-specification/order-state-changes/",
};
const k8s = {
  title: "Kubernetes 多租户",
  url: "https://kubernetes.io/docs/concepts/security/multi-tenancy/",
};
const baseCards: QuestionCard[] = [
  {
    id: "intro",
    title: "一分钟自我介绍",
    topic: "开场与业务表达",
    category: "experience",
    question: "面向高级研发架构师岗位，怎样用一分钟介绍自己的经历和能力主线？",
    summary: "先说量化与 AI 工程化的积累，再用一个代表项目引出业务和个人贡献。",
    tags: ["自我介绍", "开场", "一分钟", "职业经历"],
    cues: [
      ["主线", "量化系统与 AI 工程化。"],
      ["代表项目", "选一个能讲清业务和职责的项目。"],
      ["岗位连接", "回应对方真正需要解决的问题。"],
    ],
    diagram: {
      title: "开场顺序",
      nodes: [
        ["我的积累", "量化 / AI"],
        ["一个项目", "业务 / 职责"],
        ["目标岗位", "具体贡献"],
      ],
      note: "通用口述模板；任职时间、正式岗位和项目成果需按本人资料填写。",
    },
  },
  {
    id: "business-map",
    title: "你做的系统，到底解决什么业务问题",
    topic: "开场与业务表达",
    category: "experience",
    question:
      "请先不用技术名词，讲清系统服务谁、业务流程、原来卡在哪里，以及改造后怎样变化。",
    summary: "沿着一个使用者完成任务的流程讲，让面试官能复述系统的价值。",
    tags: ["业务表述", "业务流程", "平台", "客户", "SDK"],
    cues: [
      ["谁在使用", "具体到一个角色和任务。"],
      ["哪里卡住", "指出原流程中的一步。"],
      ["怎样改善", "说明操作变化和可验证效果。"],
    ],
    diagram: {
      title: "业务表达顺序",
      nodes: [
        ["使用者", "要完成的任务"],
        ["原流程", "障碍与影响"],
        ["新流程", "改动和结果"],
      ],
      note: "业务价值可以是交付、研发效率或运行质量；不编造营收和盈利。",
    },
  },
  {
    id: "ownership",
    title: "团队成果中，你本人负责什么",
    topic: "开场与业务表达",
    category: "experience",
    question:
      "如何用一个具体决策或模块，说明个人职责、团队分工以及自己主导的范围？",
    summary: "把团队目标、本人交付和同事分工分开，用一个实例证明责任。",
    tags: ["个人贡献", "主导", "分工", "团队", "职责"],
    cues: [
      ["责任范围", "明确自己的交付和决定权。"],
      ["协作边界", "说明同事负责的部分。"],
      ["一个证据", "选能展开细节的决策或模块。"],
    ],
    diagram: {
      title: "贡献表达顺序",
      nodes: [
        ["团队目标", "共同成果"],
        ["我的部分", "决策 / 实现"],
        ["证据", "交付与验证"],
      ],
      note: "不能把团队接触过的技术全部写成本人独立开发经历。",
    },
  },
  {
    id: "metrics",
    title: "性能数字，怎样讲得可信",
    topic: "开场与业务表达",
    category: "experience",
    question:
      "如何解释部署、回测和微秒延迟指标的统计范围、测试条件、改进原因和验证方式？",
    summary: "先报口径和条件，再讲瓶颈、改动与结果。",
    tags: ["指标", "测量", "数据", "基线", "微秒", "可信"],
    cues: [
      ["统计什么", "说明测量起止点和工作量。"],
      ["为什么变快", "给出瓶颈与改动的对应关系。"],
      ["怎样比较", "核对环境、正确性和稳定性。"],
    ],
    diagram: {
      title: "指标说明顺序",
      nodes: [
        ["基准条件", "范围 / 环境"],
        ["具体改动", "瓶颈 / 机制"],
        ["复测结果", "耗时 / 正确性"],
      ],
      note: "项目数字必须有明确口径与证据；练习模板不提供个人成绩。",
    },
  },
  {
    id: "failure-story",
    title: "一次失败或判断失误，怎么复盘",
    topic: "沟通与职业选择",
    category: "experience",
    question:
      "介绍一个本人负责的真实失败或判断失误：影响、原因、修正和验证分别是什么？",
    summary: "选一个真实问题，说明自己的责任、判断如何修正和效果如何验证。",
    tags: ["失败案例", "复盘", "判断", "反思"],
    cues: [
      ["问题", "原判断和实际影响。"],
      ["修正", "依据什么证据改变方案。"],
      ["验证", "哪些改进真正落地。"],
    ],
    diagram: {
      title: "复盘顺序",
      nodes: [
        ["原判断", "目标与遗漏"],
        ["实际问题", "影响与证据"],
        ["修正验证", "行动与结果"],
      ],
      note: "先按线上故障场景说明处理方法，真实案例另用本人经历举证。",
    },
  },
  {
    id: "closing-questions",
    title: "结束反问：岗位真正需要什么",
    topic: "沟通与职业选择",
    category: "scenario",
    question:
      "技术面结束时，如何围绕业务挑战、前三到六个月目标和架构师职责边界反问？",
    summary: "接住对方提到的问题，确认成功标准、现状约束和自己的责任范围。",
    tags: ["反问", "岗位匹配", "业务挑战", "入职目标"],
    cues: [
      ["目标", "前三到六个月最希望改变什么。"],
      ["约束", "当前具体卡在哪里。"],
      ["职责", "亲自实现、决策和协作的范围。"],
    ],
    diagram: {
      title: "反问顺序",
      nodes: [
        ["业务挑战", "最紧迫的问题"],
        ["成功标准", "期待的变化"],
        ["职责边界", "如何合作"],
      ],
      note: "挑对方尚未回答的一两项，不逐条念清单。",
    },
  },
  {
    id: "consistency",
    title: "交易的严格一致性",
    topic: "交易与一致性",
    category: "technical",
    question: "高频交易中，如何设计才能保证交易的严格一致性？",
    summary: "先界定一致性范围，再讲提交点、唯一写入权和外部成交的不确定性。",
    tags: ["高频", "Raft", "线性一致性", "fencing"],
    cues: [
      ["定边界", "先区分内部账本一致性与交易所是否已成交。"],
      ["定提交点", "明确什么时刻算成功，以及故障后从哪里恢复。"],
      ["定取舍", "讲清网络分区时如何限制写入和发单。"],
    ],
    diagram: {
      title: "沿三个边界解释",
      nodes: [
        ["内部状态", "顺序与提交"],
        ["发单网关", "校验写入权"],
        ["外部市场", "确认与对账"],
      ],
      note: "逻辑边界示意。内部复制提交不等于交易所已受理或成交。",
    },
    sources: [raft, fix],
  },
  {
    id: "unknown-order",
    title: "发单超时，能否重发？",
    topic: "交易与一致性",
    category: "scenario",
    question: "发单后超时或主节点宕机，成交状态未知时如何避免重复下单？",
    summary:
      "把超时视为结果未知，围绕稳定订单标识、恢复查询和对账讲清处理顺序。",
    tags: ["幂等", "重试", "超时", "重复下单"],
    cues: [
      ["先说未知", "超时不是交易所拒绝的证据。"],
      ["再说恢复", "按接口能力查询订单、补收回报并核对持久化状态。"],
      ["最后说重试", "说明允许重试的条件与幂等键有效范围。"],
    ],
    diagram: {
      title: "排查顺序",
      nodes: [
        ["超时", "结果未知"],
        ["恢复确认", "查单 / 回报"],
        ["决策", "等待 / 受控重试"],
      ],
      note: "依赖交易所协议；不能假设任何接口都支持相同的幂等行为。",
    },
    sources: [fix],
  },
  {
    id: "order-state",
    title: "部分成交与撤单交错",
    topic: "交易与一致性",
    category: "scenario",
    question:
      "如何设计部分成交、撤单确认与重复回报交错时的订单状态机和资金释放？",
    summary:
      "将成交事实、撤单进度与剩余冻结量分开核对，重点解释乱序和重复回报。",
    tags: ["部分成交", "撤单", "状态机", "资金冻结"],
    cues: [
      ["先举例", "订单部分成交后发出撤单，期间又收到成交回报。"],
      ["再定规则", "累计成交、剩余量与回报去重分别维护。"],
      ["再讲资金", "撤单请求不等于撤单成功，说明何时释放剩余冻结。"],
    ],
    diagram: {
      title: "必须区分的状态",
      nodes: [
        ["已部分成交", "记录成交事实"],
        ["撤单处理中", "仍可能成交"],
        ["最终确认", "核对剩余量"],
      ],
      note: "示意主线，不是完整状态机；拒单、改单、冲正等需按协议补充。",
    },
    sources: [fix],
  },
  {
    id: "split-brain",
    title: "主备切换与双主发单",
    topic: "交易与一致性",
    category: "scenario",
    question: "交易系统主备切换时，如何防止旧主继续发单造成双主？",
    summary:
      "从发单入口的权限校验讲起，再解释 epoch、恢复和失去多数派后的行为。",
    tags: ["脑裂", "主备", "epoch", "fencing"],
    cues: [
      ["看旧主", "旧主可能只是网络隔离，仍在运行。"],
      ["看网关", "发单入口必须能拒绝过期写入权。"],
      ["看接管", "恢复内部状态并核对外部在途订单后再放行。"],
    ],
    diagram: {
      title: "写入权校验示意",
      nodes: [
        ["旧主 / 新主", "携带任期"],
        ["发单入口", "接受当前权限"],
        ["交易所", "继续核对回报"],
      ],
      note: "不能只依赖旧主自觉停止。具体隔离机制需要设计和验证。",
    },
    sources: [raft],
  },
  {
    id: "p99",
    title: "P99 抖动如何定位",
    topic: "性能与低延迟",
    category: "scenario",
    question: "行情突发时，如何排查 C++ 交易系统的 P99 延迟抖动？",
    summary:
      "从端到端时间线定位慢在哪一段，再用观测证据区分排队、调度与内存问题。",
    tags: ["C++", "P99", "尾延迟", "perf", "NUMA"],
    cues: [
      ["统一口径", "先定义起止点、负载、时钟与统计窗口。"],
      ["分段定位", "区分处理时间和队列等待，再找相关系统事件。"],
      ["逐项验证", "每次改一个因素，复测尾延迟及吞吐。"],
    ],
    diagram: {
      title: "沿链路打点",
      nodes: [
        ["行情接收", "网络 / 调度"],
        ["策略处理", "排队 / 计算"],
        ["风控发单", "锁 / 内存 / I/O"],
      ],
      note: "观测位置示意，不代表某个因素已经被证实为瓶颈。",
    },
    sources: [
      {
        title: "Linux OSNOISE Tracer",
        url: "https://www.kernel.org/doc/html/v5.16/trace/osnoise-tracer.html",
      },
    ],
  },
  {
    id: "fpga",
    title: "FPGA 与软件优化的取舍",
    topic: "性能与低延迟",
    category: "technical",
    question:
      "什么时候选择 FPGA，什么时候优先做软件优化？如何解释自己参与的低延迟测试？",
    summary:
      "围绕延迟目标、瓶颈位置和变更成本选择方案，再明确团队成果与个人贡献。",
    tags: ["FPGA", "网卡", "微秒", "成本"],
    cues: [
      ["目标", "明确延迟预算、尾延迟和可接受成本。"],
      ["边界", "拆开网卡、协议处理与完整交易链路的测量范围。"],
      ["职责", "仅陈述资料支持的团队测试与本人实际参与部分。"],
    ],
    diagram: {
      title: "决策维度",
      nodes: [
        ["业务目标", "延迟 / 稳定性"],
        ["瓶颈证据", "硬件 / 软件"],
        ["方案取舍", "成本 / 迭代"],
      ],
      note: "不能把局部微秒级指标说成全链路延迟。",
    },
    profileHeading: "## 低延迟项目",
    sources: [
      {
        title: "DPDK 软硬件优化取舍",
        url: "https://doc.dpdk.org/guides-22.07/prog_guide/poll_mode_drv.html",
      },
    ],
  },
  {
    id: "coroutine",
    title: "协程如何改造订单逻辑",
    topic: "架构与工程",
    category: "experience",
    question:
      "结合我的算法交易引擎经历，如何解释事件回调改成同步风格协程的收益、风险和状态管理？",
    summary:
      "按原来的复杂度、协程改造方法、异常恢复三个层次讲，区分易用性和真实性能收益。",
    tags: ["协程", "异步", "Go", "订单"],
    cues: [
      ["原问题", "说明回调链怎样增加状态管理和策略编写难度。"],
      ["我的改动", "描述等待时让出执行、继续接收事件的方式。"],
      ["故障处理", "补充超时、取消、重入与订单状态恢复。"],
    ],
    diagram: {
      title: "表达顺序",
      nodes: [
        ["回调复杂度", "为什么改"],
        ["协程封装", "怎么改"],
        ["异常与收益", "如何验证"],
      ],
      note: "表达提纲；不表示协程天然保证线程安全或更低延迟。",
    },
    profileHeading: "## 协程与订单管理",
  },
  {
    id: "backtest",
    title: "回测并发优化，如何证明收益",
    topic: "性能与低延迟",
    category: "experience",
    question:
      "如何设计 Go 回测任务的受控并发，并用一致的测量口径验证性能收益与结果正确性？",
    summary: "先解释并发任务如何拆分，再交代基准环境、正确性与实际结果。",
    tags: ["回测", "并发", "Go", "基准测试"],
    cues: [
      ["如何拆分", "说明哪些任务独立、哪些数据或状态需要共享。"],
      ["如何限流", "解释 CPU、内存、I/O 和并发数量的关系。"],
      ["如何证明", "补齐同机同数据的耗时口径和结果一致性。"],
    ],
    diagram: {
      title: "讲清优化过程",
      nodes: [
        ["基线", "相同任务与数据"],
        ["受控并发", "拆分 / 调度"],
        ["复测", "耗时 + 正确性"],
      ],
      note: "优化前后的任务量、环境和数据必须可比，不预设任何提升倍数。",
    },
    profileHeading: "## 回测与 SDK",
    sources: [
      {
        title: "Effective Go：并发",
        url: "https://go.dev/doc/effective_go#concurrency",
      },
    ],
  },
  {
    id: "k8s",
    title: "量化托管的多租户隔离",
    topic: "架构与工程",
    category: "technical",
    question: "如何设计 K8s 上的量化任务托管与多租户隔离，防止客户之间干扰？",
    summary: "先界定租户信任关系，再从身份、网络、资源和数据四层解释隔离。",
    tags: ["K8s", "Kubernetes", "多租户", "资源池"],
    cues: [
      ["信任边界", "明确客户是否能运行任意代码，以及是否共享节点。"],
      ["隔离措施", "分别讲权限、网络策略、配额与数据访问。"],
      ["运维验证", "覆盖资源争抢、逃逸风险和故障影响范围。"],
    ],
    diagram: {
      title: "隔离层次",
      nodes: [
        ["身份与权限", "谁能操作"],
        ["网络与资源", "访问 / 争抢"],
        ["节点与数据", "风险边界"],
      ],
      note: "Namespace 是划分机制，不能单独视为完整安全边界。",
    },
    sources: [k8s],
    profileHeading: "## 多租户与任务托管",
  },
  {
    id: "aiops",
    title: "AI 运维平台，如何讲贡献",
    topic: "AI 与项目经历",
    category: "experience",
    question:
      "结合我的真实经历，如何讲清 AI 运维平台与 MCP 对话运维的架构、个人职责和收益？",
    summary:
      "先讲实施团队的痛点，再讲发布规范、可视化平台和 MCP，最后说明可验证收益。",
    tags: ["AI运维", "MCP", "发布", "回退", "个人贡献"],
    cues: [
      ["场景", "解释原有部署为什么需要人工等待和反复操作。"],
      ["职责", "讲清自己制定的规范、实现的模块和跨团队协作。"],
      ["结果", "说明改善前后的测量范围和结果，并准备真实失败案例。"],
    ],
    diagram: {
      title: "讲述主线",
      nodes: [
        ["规范与平台", "统一发布流程"],
        ["MCP 入口", "日志 / 监控 / 操作"],
        ["效果核对", "效率 / 回退 / 稳定性"],
      ],
      note: "没有资料支持的机制属于设计建议，不能当成已实现的个人成果。",
    },
    profileHeading: "## AI 运维与 MCP",
  },
  {
    id: "rag",
    title: "RAG 与 LoRA 怎么分工",
    topic: "AI 与项目经历",
    category: "technical",
    question:
      "法律法规问答场景下，RAG 和 LoRA 分别解决什么问题，如何评估回答是否可靠？",
    summary:
      "分别解释知识检索与模型适配，再把检索命中、引用支持和回答质量分开评估。",
    tags: ["RAG", "LoRA", "知识库", "幻觉", "评测"],
    cues: [
      ["问题拆开", "区分没有检索到资料、上下文不合适和生成错误。"],
      ["方法分工", "说明为何检索或适配，而不把两者当作万能开关。"],
      ["评估闭环", "用留出的真实问题核对命中、引用与拒答。"],
    ],
    diagram: {
      title: "问答链路示意",
      nodes: [
        ["问题", "检索与筛选"],
        ["证据", "带来源的上下文"],
        ["回答", "核对与评估"],
      ],
      note: "加入检索不自动消除幻觉；微调收益需要单独评测。",
    },
    sources: [
      { title: "RAG 原始论文", url: "https://arxiv.org/abs/2005.11401" },
      { title: "LoRA 原始论文", url: "https://arxiv.org/abs/2106.09685" },
    ],
    profileHeading: "## 知识库问答",
  },
  {
    id: "deployment",
    title: "发布失败，怎样回退",
    topic: "架构与工程",
    category: "scenario",
    question: "交易或运维平台发布失败时，如何设计灰度、回退和数据兼容性保障？",
    summary:
      "围绕发布前检查、放量观测与停止条件讲，再解释代码回退和数据回退的差别。",
    tags: ["灰度", "发布", "回滚", "兼容性"],
    cues: [
      ["发布前", "识别数据库、配置、协议和在途任务的兼容约束。"],
      ["发布中", "定义健康指标、灰度范围及暂停条件。"],
      ["失败后", "区分停止放量、版本回退和业务数据修复。"],
    ],
    diagram: {
      title: "发布决策示意",
      nodes: [
        ["兼容性检查", "版本 / 数据"],
        ["灰度观测", "健康与业务指标"],
        ["继续或回退", "按停止条件"],
      ],
      note: "工作负载版本回退不意味着数据库和外部副作用自动恢复。",
    },
    sources: [
      {
        title: "Kubernetes Deployment",
        url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
      },
    ],
  },
  {
    id: "kafka",
    title: "Exactly-once 到底保证什么",
    topic: "交易与一致性",
    category: "technical",
    question:
      "Kafka exactly-once 能否保证交易只执行一次？怎样划定幂等与事务的边界？",
    summary:
      "先说保证的系统边界，再追问外部发单和数据库写入是否参与同一协调机制。",
    tags: ["Kafka", "exactly-once", "事务", "端到端"],
    cues: [
      ["内部保证", "区分消息处理、状态更新与消费位点提交。"],
      ["外部影响", "说明交易所发单是否属于同一事务范围。"],
      ["恢复方法", "结合业务幂等、持久化状态与对账设计恢复。"],
    ],
    diagram: {
      title: "保证范围示意",
      nodes: [
        ["Kafka 内部", "读 / 状态 / 写"],
        ["系统边界", "外部调用"],
        ["交易所", "单独确认与恢复"],
      ],
      note: "不能把消息系统内部语义直接推导成跨系统恰好一次成交。",
    },
    sources: [
      {
        title: "Kafka 设计文档",
        url: "https://kafka.apache.org/40/design/design/",
      },
    ],
  },
  {
    id: "architecture-story",
    title: "一次架构改造，怎么讲清楚",
    topic: "AI 与项目经历",
    category: "experience",
    question:
      "结合我的真实项目，介绍一次我主导的架构改造：为什么改、做了什么取舍、个人贡献和结果是什么？",
    summary:
      "用一个具体项目讲完背景、决策、行动和结果，再准备被放弃方案的理由。",
    tags: ["架构师", "STAR", "取舍", "主导", "经历"],
    cues: [
      ["为什么改", "说明具体业务约束，避免从技术名词开始。"],
      ["怎么取舍", "比较候选方案，指出你负责的决策和实现。"],
      ["结果与反思", "给出已有证据，缺少指标时说清观察方法。"],
    ],
    diagram: {
      title: "表达顺序",
      nodes: [
        ["背景 / 目标", "问题是什么"],
        ["决策 / 行动", "我做了什么"],
        ["结果 / 反思", "证据与不足"],
      ],
      note: "这是组织表达的提纲，不预设你做过未记录的项目。",
    },
  },
  {
    id: "motivation",
    title: "为什么选择新的技术岗位",
    topic: "沟通与职业选择",
    category: "experience",
    question:
      "根据我的真实经历与职业目标，如何自然解释求职动机、岗位匹配和交接安排？",
    summary: "从长期技术方向出发，简述当前变化，再连接目标岗位能发挥的能力。",
    tags: ["求职动机", "岗位匹配", "离职", "职业规划"],
    cues: [
      ["方向", "说明希望长期积累的金融科技与 AI 工程化能力。"],
      ["变化", "客观描述业务方向与个人兴趣的差异。"],
      ["匹配", "用已有项目说明自己能为目标岗位解决什么问题。"],
    ],
    diagram: {
      title: "表达顺序",
      nodes: [
        ["过去积累", "量化 / 架构 / AI"],
        ["当前选择", "长期技术方向"],
        ["岗位匹配", "具体贡献"],
      ],
      note: "求职动机以本人最新想法为准；不替你承诺薪资、到岗日期或排序。",
    },
  },
  {
    id: "incident",
    title: "线上故障，先做什么",
    topic: "架构与工程",
    category: "scenario",
    question:
      "量化交易系统线上出现异常订单、延迟或账实不符时，如何止损、定位、恢复并复盘？",
    summary: "先控制影响和保留证据，再定位故障；恢复前核对订单与资金状态。",
    tags: ["故障", "止损", "恢复", "对账", "复盘"],
    cues: [
      ["控制影响", "说明暂停、限流或隔离的触发条件和影响。"],
      ["按证据定位", "关联订单标识、日志、指标与变更记录。"],
      ["受控恢复", "核对状态，逐步放行，保留复盘改进项。"],
    ],
    diagram: {
      title: "处置表达顺序",
      nodes: [
        ["控制影响", "边界与证据"],
        ["定位核对", "订单 / 资金 / 变更"],
        ["恢复复盘", "验证后放行"],
      ],
      note: "具体处置取决于权限与业务约束，不能默认直接重启或重发订单。",
    },
  },
];

export const questionCards: QuestionCard[] = baseCards.map((card) => {
  const prepared = interviewPrep[card.id];
  const sources = [
    ...new Map(
      [...(card.sources || []), ...(prepared?.references || [])].map(
        (source) => [source.url, source],
      ),
    ).values(),
  ];
  return { ...card, prepared, sources };
});

export function cardMatches(card: QuestionCard, query: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const haystack = [
    card.title,
    card.question,
    card.summary,
    ...card.tags,
    card.prepared?.opener || "",
    ...(card.prepared?.followUps.map(([q]) => q) || []),
    ...(card.prepared?.process?.flat() || []),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}
export function cardJob(card: QuestionCard, jobs: Job[], contextKey?: string) {
  return (
    card.liveJob ||
    [...jobs]
      .reverse()
      .find(
        (j) =>
          j.question === card.question &&
          (!contextKey || j.contextKey === contextKey),
      )
  );
}
export function profileExcerpt(profile: string, heading?: string) {
  if (!heading || !profile.includes(heading)) return "";
  return profile
    .split(heading)[1]
    .split(/\n#{1,3} /)[0]
    .trim();
}
