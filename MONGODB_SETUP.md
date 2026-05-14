# MongoDB Docker 設定指南

## 📦 快速開始

### 1️⃣ 啟動 MongoDB 容器

```bash
docker-compose up -d
```

**輸出應該顯示：**
```
[+] Running 2/2
 ✔ Volume "pmps_mongodb_data"    Created
 ✔ Container pmp_mongodb        Started
```

### 2️⃣ 驗證連線

```bash
# 檢查容器狀態
docker ps | grep pmp_mongodb

# 或使用 mongosh 連線測試
mongosh mongodb://localhost:27018/pmp_system
```

### 3️⃣ 配置應用程序

在根目錄創建 `.env.local` 檔案：

```env
MONGODB_URI=mongodb://localhost:27018/pmp_system
```

或帶身份驗證：
```env
MONGODB_URI=mongodb://pmp_user:pmp_password@localhost:27018/pmp_system?authSource=pmp_system
```

### 4️⃣ 開發時使用

```bash
# 安裝依賴
pnpm install

# 啟動開發環境
pnpm dev

# 如果需要初始數據
pnpm seed:demo
```

---

## 🛠️ 常用命令

```bash
# 查看 MongoDB 容器日誌
docker logs -f pmp_mongodb

# 進入 MongoDB 容器
docker exec -it pmp_mongodb mongosh -u admin -p admin123

# 停止容器
docker-compose down

# 停止並刪除數據卷（清除所有數據）
docker-compose down -v

# 重啟容器
docker-compose restart
```

---

## 🔐 認證信息

| 項目 | 值 |
|------|-----|
| **主機** | localhost |
| **端口** | 27018 |
| **管理員用戶** | admin |
| **管理員密碼** | admin123 |
| **應用數據庫** | pmp_system |
| **應用用戶** | pmp_user |
| **應用密碼** | pmp_password |

---

## 📊 監控 MongoDB

### 查看數據庫狀態
```bash
docker exec pmp_mongodb mongosh -u admin -p admin123 --eval "db.stats()"
```

### 查看 pmp_system 數據庫
```bash
docker exec pmp_mongodb mongosh -u pmp_user -p pmp_password --authSource pmp_system --eval "use pmp_system; db.getCollectionNames()"
```

---

## 🐛 故障排除

**1. 端口已被佔用**
```bash
# 檢查 27018 是否已被使用
netstat -ano | findstr :27018  # Windows

# 修改 docker-compose.yml 中的端口
# "27019:27017"  # 改用 27019
```

**2. 容器無法啟動**
```bash
# 查看詳細日誌
docker logs pmp_mongodb

# 清除並重新啟動
docker-compose down -v
docker-compose up -d
```

**3. 無法連線**
- 確認 Docker daemon 正在運行
- 確認 `.env.local` 中的 MONGODB_URI 正確
- 檢查防火牆設定

---

## 💾 數據持久化

所有數據儲存在 Docker volume `pmps_mongodb_data` 中，容器刪除後數據依然保存。

要完全清除數據：
```bash
docker-compose down -v
```

