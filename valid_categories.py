import requests
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.colab import files

# ====================== 1. 設定來源 ======================
# 讀取你 GitHub 上的原始清單
VOD_LIST_URL = "https://raw.githubusercontent.com/ddhola/file/refs/heads/main/Wtvbox_list2.txt"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def get_sources_from_github():
    sources = []
    try:
        response = requests.get(VOD_LIST_URL, timeout=10)
        content = response.text
        # 使用正則表達式解析 { name: "...", api: "..." }
        pattern = r'\{\s*name:\s*"(.*?)",\s*api:\s*"(.*?)"\s*\}'
        matches = re.findall(pattern, content)
        for name, api in matches:
            sources.append({"name": name, "api": api})
        print(f"📡 成功從 GitHub 抓取到 {len(sources)} 個站點")
    except Exception as e:
        print(f"❌ 抓取清單失敗: {e}")
    return sources

# ====================== 2. 檢查函數 ======================
def check_category_has_data(api_base, type_id):
    try:
        # 確保網址接合正確
        url = api_base.rstrip('/')
        sep = "&" if "?" in url else "?"
        check_url = f"{url}{sep}ac=detail&t={type_id}&pg=1"
        
        r = requests.get(check_url, headers=headers, timeout=10)
        data = r.json()
        page_list = data.get("list", [])
        return True if page_list and len(page_list) > 0 else False
    except:
        return False

def process_site(src):
    site_name = src["name"]
    api_url = src["api"]
    valid_tids = []
    
    try:
        url = api_url.rstrip('/')
        sep = "&" if "?" in url else "?"
        r = requests.get(f"{url}{sep}ac=list", headers=headers, timeout=10)
        data = r.json()
        class_list = data.get("class", []) or data.get("types", []) or []
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_tid = {executor.submit(check_category_has_data, api_url, c['type_id']): str(c['type_id']) for c in class_list if 'type_id' in c}
            for future in as_completed(future_to_tid):
                tid = future_to_tid[future]
                if future.result():
                    valid_tids.append(tid)
                    
        return api_url, valid_tids
    except:
        return api_url, []

# ====================== 3. 主執行程序 ======================
def main():
    sources = get_sources_from_github()
    if not sources:
        print("停止執行：找不到任何站點來源。")
        return

    final_map = {}
    print("🚀 開始全自動掃描有效分類（讀取 GitHub 實時清單）...\n")
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_site = {executor.submit(process_site, s): s for s in sources}
        for future in as_completed(future_to_site):
            api_key, tids = future.result()
            if tids:
                final_map[api_key] = tids
                print(f"✅ 完成: {api_key} ({len(tids)} 個分類)")

    output_file = "valid_categories.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(final_map, f, ensure_ascii=False, indent=4)
    
    print(f"\n🎉 驗證清單已生成，準備下載...")
    files.download(output_file)

if __name__ == "__main__":
    main()