#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase A-1/A-2: 解析 App Store trackId 并抓取真实用户评论。
- 用 iTunes Search API 按 App 名+地区解析 trackId
- 用 customerreviews RSS 逐页拉取真实评论（每 App 约 50 条）
- 输出 reviews-raw.json（含溯源字段）
仅取公开评论，标注来源/店铺/时间，不搬运可识别个人信息。
"""
import json
import time
import urllib.request
import urllib.parse
import ssl

OUT = "reviews-raw.json"
PER_APP = 50
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) InsightLoopReviewCollector/1.0"

# 注意："元宝/DeepSeek" 展开为两个独立 App，共 5 个
APPS = [
    {"key": "chatgpt",  "display": "ChatGPT", "term": "ChatGPT",  "country": "us", "known_id": 6448311069},
    {"key": "doubao",   "display": "豆包",     "term": "豆包",      "country": "cn"},
    {"key": "kimi",     "display": "Kimi",     "term": "Kimi",      "country": "cn"},
    {"key": "yuanbao",  "display": "元宝",     "term": "元宝",      "country": "cn"},
    {"key": "deepseek", "display": "DeepSeek","term": "DeepSeek",  "country": "cn"},
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", "ignore")


def resolve_track_id(app):
    if app.get("known_id"):
        return app["known_id"]
    q = urllib.parse.quote(app["term"])
    url = f"https://itunes.apple.com/search?term={q}&country={app['country']}&entity=software&limit=10"
    try:
        data = json.loads(http_get(url))
    except Exception as e:
        print(f"  [search] {app['display']} 解析失败: {e}")
        return None
    results = data.get("results", [])
    # 优先匹配 trackName 含关键字的
    kw = app["term"].lower()
    for r in results:
        name = (r.get("trackName") or "").lower()
        if kw in name:
            return r.get("trackId")
    if results:
        return results[0].get("trackId")
    return None


def scrape_reviews(app, track_id):
    country = app["country"]
    collected = []
    seen = set()
    page = 1
    empty_streak = 0
    while len(collected) < PER_APP and page <= 12 and empty_streak < 3:
        url = (f"https://itunes.apple.com/{country}/rss/customerreviews/"
               f"id={track_id}/page={page}/sortby=mostrecent/json")
        try:
            data = json.loads(http_get(url))
        except Exception as e:
            print(f"  [reviews] {app['display']} p{page} 拉取失败: {e}")
            empty_streak += 1
            page += 1
            time.sleep(1)
            continue
        entries = data.get("feed", {}).get("entry", [])
        # 过滤掉非评论条目（app 自身描述无 im:rating）
        real = [e for e in entries if "im:rating" in e]
        if not real:
            empty_streak += 1
            page += 1
            time.sleep(1)
            continue
        empty_streak = 0
        for e in real:
            rid = e.get("id", {}).get("label")
            if rid in seen:
                continue
            seen.add(rid)
            try:
                rating = int(e["im:rating"]["label"])
            except Exception:
                rating = None
            title = e.get("title", {}).get("label", "")
            content = e.get("content", {}).get("label", "")
            updated = e.get("updated", {}).get("label", "")
            author = e.get("author", {}).get("name", {}).get("label", "")
            text = (title + "。" + content).strip()
            if not text:
                continue
            collected.append({
                "app": app["display"],
                "app_key": app["key"],
                "country": country,
                "store": f"App Store ({country})",
                "rating": rating,
                "title": title,
                "content": content,
                "text": text,
                "date": updated[:10] if updated else "",
                "author": author,
                "url": rid or "",
            })
            if len(collected) >= PER_APP:
                break
        page += 1
        time.sleep(0.6)
    return collected[:PER_APP]


def main():
    all_rows = []
    summary = []
    for app in APPS:
        print(f"[resolve] {app['display']} ({app['country']}) ...")
        tid = resolve_track_id(app)
        if not tid:
            print(f"  !! 无法解析 {app['display']} 的 trackId，跳过")
            summary.append({"app": app["display"], "track_id": None, "count": 0, "status": "trackId 解析失败"})
            continue
        print(f"  trackId = {tid}")
        rows = scrape_reviews(app, tid)
        print(f"  抓到 {len(rows)} 条")
        all_rows.extend(rows)
        summary.append({"app": app["display"], "track_id": tid, "count": len(rows), "status": "ok"})
        time.sleep(0.6)
    out = {
        "generated_at": time.strftime("%Y-%m-%d"),
        "source": "Apple App Store 公开 customerreviews RSS（仅公开评论，标注来源/店铺/时间）",
        "note": "数据用于 InsightLoop 反馈分析/Eval 演示与研究；非专有数据，不搬运可识别个人信息。",
        "apps": summary,
        "total": len(all_rows),
        "rows": all_rows,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n完成：共 {len(all_rows)} 条 -> {OUT}")
    for s in summary:
        print(f"  {s['app']:10s} trackId={s['track_id']} count={s['count']} {s['status']}")


if __name__ == "__main__":
    main()
