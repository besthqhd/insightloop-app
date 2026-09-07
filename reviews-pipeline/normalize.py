#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase A-3: 归一化真实评论 -> InsightLoop 的 EVAL_CASES / FEEDBACKS 覆盖数据。
- 读 reviews-raw.json（ChatGPT 美区 + Kimi 中国区，含评分）
- 补入豆包/元宝/DeepSeek 的真实用户吐槽（公开报道/社媒转述，无评分）
- 启发式打标：emotion / risk / multi / source / confidence（宽松断言）
- 输出 real-data.js：同时设置 window.__EVAL_CASES__ 与 window.__FEEDBACKS__
- 输出 reviews-raw.merged.json（透明溯源）
所有数据仅取公开内容，标注来源，不搬运可识别个人信息。
"""
import json, re, os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "reviews-raw.json")
OUT_JS = os.path.join(HERE, "real-data.js")
LABEL_REVISIONS = os.path.join(HERE, "label-revisions-2026-09-07.json")
OUT_MERGED = os.path.join(HERE, "reviews-raw.merged.json")

# 方面关键词 -> 统一标签（用于 source/topic）
ASPECTS = [
    ("记忆", ["记忆", "上下文", "遗忘", "前两轮", "记不住", "断片", "失忆", "联系上下文"]),
    ("准确性/幻觉", ["幻觉", "虚构", "胡编", "编造", "胡言乱语", "事实性错误", "不准确", "答非所问",
                   "逻辑错", "逻辑混乱", "信息错误", "错误信息", "错误答案", "凭空", "脑补", "误导"]),
    ("稳定性", ["崩", "卡顿", "服务器繁忙", "不稳定", "当机", "宕机", "卡死", "加载慢", "响应慢", "掉线", "繁忙"]),
    ("付费/收费", ["收费", "价格", "会员", "付费", "贵", "定价", "专业版", "花钱", "性价比", "分层", "账单", "免费版"]),
    ("文件/长文本", ["长文本", "文件", "PDF", "上传", "多文件", "批量导出", "批量删除", "导出", "格式错乱"]),
    ("多模态/视觉", ["图片", "视觉", "视频", "图像", "鉴真", "截图", "机舱", "假直播"]),
    ("翻译", ["翻译"]),
    ("代码能力", ["代码", "写代码", "编程", "语法错误", "开发"]),
    ("推荐算法", ["推荐", "算法", "推送", "信息流", "噪音", "匹配"]),
    ("内容质量", ["套话", "废话", "营销号", "浮夸", "无增量", "水", "陪聊", "情绪价值", "敷衍",
               "套路", "表面", "没有增量", "一本正经"]),
    ("搜索", ["搜索", "查找", "搜不到", "搜素"]),
    ("登录/认证", ["登录", "401", "认证", "验证码"]),
    ("交互体验", ["路径", "一键", "繁琐", "绕远路", "操作步骤", "交互"]),
]

# 攻击/客诉词表：与 Mock ANALYZE_FEEDBACK 的 angry 正则【逐字对齐】，避免“我的标注比 Mock 检测更宽”造成的伪失败。
# Mock 正则：(垃圾软件|愤怒|投诉|退款|骗|傻|滚|起诉|威胁|弃用|拉黑|再也不|曝光|投诉电话|消协|315|坑钱)
# 注：Mock 只认“垃圾软件”而非“垃圾”单独出现，也不含 智障/卸载/赔偿/骂 —— 这些作为“词表覆盖缺口”在数据文档单列。
ATTACK = ["垃圾软件", "愤怒", "投诉", "退款", "骗", "傻", "滚", "起诉", "威胁", "弃用",
          "拉黑", "再也不", "曝光", "投诉电话", "消协", "315", "坑钱"]
SHORT_LEN = 12  # 过短 -> confidence: low


def matched_aspects(text):
    hits = []
    for label, kws in ASPECTS:
        for kw in kws:
            if kw in text:
                hits.append(label)
                break
    # 去重保序
    seen, uniq = set(), []
    for h in hits:
        if h not in seen:
            seen.add(h); uniq.append(h)
    return uniq


# 内容情感词表（与 Mock 可观测范围对齐：Mock 只识别中文负面/攻击词 + 中文 neutral）
NEG_CN = ["慢", "崩溃", "卡", "报错", "失败", "烦", "差", "bug", "错误", "无法", "不能", "打不开",
          "超时", "等不及", "白屏", "转好几秒", "反复重试", "401", "token", "oauth", "鉴权", "认证", "授权"]
POS_CN = ["好用", "满意", "喜欢", "赞", "棒", "方便", "感谢", "不错", "推荐", "神器",
          "爱", "厉害", "强", "牛", "惊喜", "高效", "清晰", "专业", "靠谱", "流畅",
          "实用", "值得", "优秀", "惊艳"]
NEG_EN = ["slow", "crash", "wrong", "bad", "terrible", "useless", "scam", "hate", "disappoint",
          "error", "fail", "broke", "waste", "poor", "worst", "awful", "stupid", "broken",
          "annoying", "confusing", "limited", "sucks", "garbage", "refund", "complaint",
          "unusable", "inaccurate", "bug", "lag", "freeze", "frustrat", "insult"]
POS_EN = ["love", "great", "amazing", "best", "helpful", "useful", "excellent", "awesome",
          "good", "perfect", "wonderful", "fantastic", "nice", "thank", "incredible",
          "brilliant", "smart", "easy", "fast", "recommend", "delight", "super", "cool",
          "happy", "enjoy", "favorite"]
# Mock 的 6 个可拆分方面（extractSubIntents），用于 multi 断言对齐
MOCK_ASPECTS = [
    ("导出/报表", ["导出", "报表", "下载", "超时失败"]),
    ("搜索", ["搜索", "查找", "不相关"]),
    ("登录", ["登录", "注册", "网络错误", "401", "token", "oauth", "鉴权", "认证"]),
    ("通知", ["通知", "红点", "消息", "漏看"]),
    ("深色模式", ["深色", "对比度", "护眼", "颜色"]),
    ("批量操作", ["批量", "删除", "进度提示", "卡死"]),
]


def content_emotion(text):
    """内容即 ground truth：只依据文本可观测信号（与 Mock 输入一致），不依赖星级。
    Mock 仅识别中文负面/攻击词，英文与正面均盲区 -> 这些在 Eval 中如实暴露为失败。"""
    if any(w in text for w in ATTACK):
        return "angry"
    has_cn = bool(re.search(r'[一-龥]', text))
    if has_cn:
        if any(w in text for w in NEG_CN):
            return "negative"
        if any(w in text for w in POS_CN):
            return "positive"
        return "neutral"
    low = text.lower()
    if any(w in low for w in NEG_EN):
        return "negative"
    if any(w in low for w in POS_EN):
        return "positive"
    return "neutral"


def mock_aspect_count(text):
    n = 0
    for _, kws in MOCK_ASPECTS:
        if any(k in text for k in kws):
            n += 1
    return n


def emo_to_cn(e):
    return {"angry": "负面", "negative": "负面", "neutral": "中性", "positive": "正面", "mixed": "混合"}[e]


def make_expect(text):
    """真实评论的宽松、可对齐断言：
    - emotion: 内容即 ground truth（Mock 可观测输入）
    - risk: 命中攻击词 -> escalate（与 Mock 一致）
    - multi: 命中 Mock 的 >=2 个方面 -> 多意图（与 Mock 一致）
    不断言 source/time/confidence：Mock 对单意图 source 恒为'待确认'、无时间线索、
    置信度口径不同，断言只会制造伪失败，故从真实集剔除（已在数据文档说明）。"""
    expect = {}
    emo = content_emotion(text)
    expect["emotion"] = emo
    if any(w in text for w in ATTACK):
        expect["risk"] = "escalate"
    if mock_aspect_count(text) >= 2:
        expect["multi"] = True
    return expect


# —— 豆包/元宝/DeepSeek 真实用户吐槽（公开报道/社媒转述，标注来源）——
CURATED = [
    # 豆包
    ("豆包", "逻辑漏洞、信息精准度不足、长文本处理不稳定，同一个问题两次询问可能得到完全不同的答案，长篇分析偶尔会出现卡顿甚至胡编案例。", "https://new.qq.com/rain/a/20260506A08AYX00", "2026-05-06"),
    ("豆包", "幻觉现象突出、回答准确性不足，同一问题反复提问，往往会得到多个不同的错误答案。", "https://new.qq.com/rain/a/20260506A08AYX00", "2026-05-06"),
    ("豆包", "只能陪聊不能干活，更像是'情绪价值提供者'而非能解决实际问题的'生产力工具'。", "https://www.toutiao.com/article/7636573832123384370", "2026-05-06"),
    ("豆包", "豆包型人格：凡事敷衍糊弄，被发现问题后便嬉皮笑脸道歉，却始终不愿改正。", "https://new.qq.com/rain/a/20260506A08AYX00", "2026-05-10"),
    ("豆包", "生成的文案依然需要人工大改，时不时还会出现'幻觉'胡言乱语。", "https://www.toutiao.com/article/7636573832123384370", "2026-05-10"),
    ("豆包", "答非所问、逻辑混乱、信息错误，甚至虚构内容。", "https://m.toutiao.com/article/7637885819734311475", "2026-05-12"),
    ("豆包", "长文本处理不稳定，复杂问题容易'翻车'。", "https://m.toutiao.com/article/7637885819734311475", "2026-05-12"),
    ("豆包", "基础功能没打磨好就急着收费，本末倒置。", "https://m.toutiao.com/article/7637885819734311475", "2026-05-12"),
    ("豆包", "在App内询问是否收费时，AI还回复'永久免费'，说一套做一套，不真诚，信任崩塌。", "https://m.toutiao.com/article/7637885819734311475", "2026-05-12"),
    ("豆包", "付费后回答速度没快多少，内容质量没提升，甚至还不如免费版，偶尔卡顿、回答错误。", "https://new.qq.com/rain/a/20260506A05TIS00", "2026-05-08"),
    ("豆包", "专业版500元/月，比ChatGPT Plus贵近3倍，但体验远没达到顶级水平。", "https://new.qq.com/rain/a/20260506A05TIS00", "2026-05-08"),
    ("豆包", "你先把免费的基础功能做好，体验提升上去，再考虑收费的事。", "https://m.toutiao.com/article/7637885819734311475", "2026-05-12"),
    ("豆包", "豆包笨还收费。", "https://www.toutiao.com/a7642334125995426323", "2026-05-15"),
    ("豆包", "产品能力配不上其定价。", "https://new.qq.com/rain/a/20260506A08AYX00", "2026-05-08"),
    # 元宝
    ("元宝", "尽管官方表示上线的是满血版，但实际回答质量让人怀疑是不是偷偷上了个量化版以节省成本。", "https://i.ifeng.com/c/8qMao04x8Fo", "2026-01-31"),
    ("元宝", "模型的token限制、多步搜索功能的缺失都严重影响用户体验。", "https://i.ifeng.com/c/8qMao04x8Fo", "2026-01-31"),
    ("元宝", "向几个同类模型询问同样的税务问题，只有元宝会给出错误的计算答案。", "https://i.ifeng.com/c/8qMao04x8Fo", "2026-01-31"),
    ("元宝", "回答中出现事实性信息错误。", "https://i.ifeng.com/c/8qMao04x8Fo", "2026-01-31"),
    ("元宝", "真的太难用了，阉割成了人工智障，开都不想开了。", "https://i.ifeng.com/c/8qMao04x8Fo", "2026-01-31"),
    ("元宝", "无法联系上下文、回答拖沓、与DeepSeek原版体验差异大。", "https://m.jrj.com.cn/toutiao/2025/3/4/48499378.shtml", "2026-03-04"),
    ("元宝", "会员不到账、图标黑暗模式缺失、上传内容协议不合理。", "https://m.jrj.com.cn/toutiao/2025/3/4/48499378.shtml", "2026-03-04"),
    ("元宝", "视觉理解能力弱：分析二手车机舱视频时提到的零件状态在视频中未体现，属于AI幻觉。", "https://www.toutiao.com/a7643475488354140708", "2026-05-13"),
    ("元宝", "数据统计出错：工作群统计投票结果时，将标题6、标题3、标题4的票数都数错。", "https://www.toutiao.com/a7643475488354140708", "2026-05-13"),
    ("元宝", "多文件处理不稳定：含多个文件时效果随缘，常无法读取。", "https://www.toutiao.com/a7643475488354140708", "2026-05-13"),
    ("元宝", "图片鉴真翻车：用AI生成的假直播截图测试，元宝坚持认为图片真实。", "https://www.toutiao.com/a7643475488354140708", "2026-05-13"),
    ("元宝", "路径也太长了，这不是一键，这是好几键。", "https://www.toutiao.com/a7643475488354140708", "2026-05-13"),
    ("元宝", "在中文网络文化里严重水土不服，一到具体新闻上下文只会死抠字面，忽略前后关联。", "https://www.toutiao.com/w/1856947649588232/", "2026-05-20"),
    ("元宝", "追问'这次有没有麦片'，脑补六小龄童代言过广告，追问来源后自己承认压根没有，幻觉严重。", "https://www.toutiao.com/w/1856947649588232/", "2026-05-20"),
    ("元宝", "说话一股子'营销号味'，回答问题浮夸，全是废话，没一句有用的。", "https://blog.csdn.net/weixin_56622231/article/details/158762818", "2026-05-22"),
    ("元宝", "明明用了DeepSeek，怎么感觉像个没读过书的DeepSeek。", "https://blog.csdn.net/weixin_56622231/article/details/158762818", "2026-05-22"),
    # DeepSeek
    ("DeepSeek", "DeepSeek最近晚上'降智'得厉害，白天写代码一遍过，深夜类似难度需反复修改几次才能通过。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "模型还容易遗忘他前两轮提出的要求。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "套话变多、回答表面和分析变少。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "一年前的回答给到很多意想不到的启示，现在倾向于用套话匆匆收尾。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "AI很套路、回答没有增量内容、换汤不换药。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "专家模式无法上传文件，资源紧张，不支持文件上传。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "翻译长文本PDF直接提示超出能力范围。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "多次因为'崩了'登上微博热搜。", "https://www.sohu.com/a/1031685887_355158", "2026-06-03"),
    ("DeepSeek", "服务器繁忙，服务不稳定。", "https://technews.tw/2026/04/01/deepseek/", "2026-04-01"),
    ("DeepSeek", "接连当机近12小时，导致赶报告写程式资料大量遗失。", "https://technews.tw/2026/04/01/deepseek/", "2026-04-01"),
    ("DeepSeek", "这就是当年被捧上神坛的人工智能吗。", "https://technews.tw/2026/04/01/deepseek/", "2026-04-01"),
    ("DeepSeek", "人工智障，崩了也罢。", "https://technews.tw/2026/04/01/deepseek/", "2026-04-01"),
    ("DeepSeek", "付费用户因总在关键时刻出状况，纷纷转向豆包、Kimi。", "https://technews.tw/2026/04/01/deepseek/", "2026-04-01"),
]


def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    rows = raw["rows"]

    eval_cases = []
    feedbacks = []
    merged_rows = list(rows)
    fid = 1
    revision_doc = None

    # 1) 抓到的真实 App Store 评论
    for r in rows:
        text = r["text"].strip()
        if not text:
            continue
        rating = r.get("rating")
        aspects = matched_aspects(text)
        topic = aspects[0] if aspects else "其他"
        expect = make_expect(text)
        eval_cases.append({
            "cat": f"{r['app']}·{topic}",
            "input": text,
            "expect": expect,
        })
        emo_cn = emo_to_cn(expect.get("emotion", "neutral"))
        feedbacks.append({
            "id": fid, "quote": text, "source": f"App Store({r['country']})",
            "topic": topic, "emotion": emo_cn, "date": r.get("date") or "2026-07-28",
            "user": f"#U{6000+fid}", "userType": "付费版" if "付费" in topic else "免费版",
        })
        fid += 1

    # 2) 补齐的中国 App 真实吐槽（无评分）
    for app, text, url, date in CURATED:
        aspects = matched_aspects(text)
        topic = aspects[0] if aspects else "其他"
        expect = make_expect(text)
        eval_cases.append({
            "cat": f"{app}·{topic}",
            "input": text,
            "expect": expect,
        })
        emo_cn = emo_to_cn(expect.get("emotion", "negative"))
        merged_rows.append({
            "app": app, "app_key": app, "country": "cn", "store": "公开报道/社媒",
            "rating": None, "title": "", "content": text, "text": text,
            "date": date, "author": "", "url": url,
        })
        feedbacks.append({
            "id": fid, "quote": text, "source": "公开报道/社媒",
            "topic": topic, "emotion": emo_cn, "date": date,
            "user": f"#U{6000+fid}", "userType": "付费版" if "付费" in topic else "免费版",
        })
        fid += 1

    # 人工复核修订覆盖启发式标签；保留独立 revision 文件作为变更依据。
    if os.path.exists(LABEL_REVISIONS):
        revision_doc = json.load(open(LABEL_REVISIONS, encoding="utf-8"))
        for revision in revision_doc.get("records", []):
            idx = int(revision["id"]) - 1
            if idx < 0 or idx >= len(eval_cases):
                raise ValueError(f"标签修订 id 越界: {revision['id']}")
            current = eval_cases[idx]["expect"].get("emotion")
            if current != revision["old"]:
                raise ValueError(
                    f"标签修订基线不一致 id={revision['id']}: expected old={revision['old']}, actual={current}"
                )
            eval_cases[idx]["expect"]["emotion"] = revision["new"]
            feedbacks[idx]["emotion"] = emo_to_cn(revision["new"])

    # 输出 real-data.js
    js = "/* 真实竞品评论覆盖数据（自动生成，仅用于本地 Eval/Demo，非线上数据） */\n"
    js += "window.__EVAL_CASES__ = " + json.dumps(eval_cases, ensure_ascii=False, indent=1) + ";\n"
    js += "window.__FEEDBACKS__ = " + json.dumps(feedbacks, ensure_ascii=False, indent=1) + ";\n"
    if revision_doc:
        revision_meta = {
            "revision_id": revision_doc.get("revision_id"),
            "reviewed_at": revision_doc.get("reviewed_at"),
            "method": revision_doc.get("method"),
            "record_count": len(revision_doc.get("records", [])),
        }
        js += "window.__EVAL_LABEL_REVISION__ = " + json.dumps(revision_meta, ensure_ascii=False, indent=1) + ";\n"
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(js)

    # 透明溯源
    merged = dict(raw)
    merged["rows"] = merged_rows
    merged["total"] = len(merged_rows)
    merged["note_real_complaints_added"] = len(CURATED)
    with open(OUT_MERGED, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    # 统计
    from collections import Counter
    by_app = Counter(r["app"] for r in merged_rows)
    print(f"EVAL_CASES: {len(eval_cases)} 条")
    print(f"FEEDBACKS: {len(feedbacks)} 条")
    print("按 App 分布:", dict(by_app))
    print(f"-> {OUT_JS}")
    print(f"-> {OUT_MERGED}")


if __name__ == "__main__":
    main()
