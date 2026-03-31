import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "app": {
        "title": "Dispatch System",
      },
      "nav": {
        "dashboard": "Dashboard",
        "notifications": "Notifications",
        "opportunities": "Opportunities",
        "presales": "Presales Timesheets",
        "projects": "Projects",
        "project_timesheets": "Project Timesheets",
        "change_requests": "Change Requests",
        "resources": "Resources",
        "utilization": "Utilization",
        "kpi": "KPI Dashboard",
        "settlements": "Settlements",
        "reports": "Reports",
        "users": "User Management",
        "cost_rates": "Cost Rates",
        "custom_fields": "Custom Fields",
        "system_settings": "System Settings"
      }
    }
  },
  zh: {
    translation: {
      "app": {
        "title": "Dispatch System",
      },
      "nav": {
        "dashboard": "儀表板",
        "notifications": "通知中心",
        "opportunities": "商機管理",
        "presales": "協銷工時",
        "projects": "專案管理",
        "project_timesheets": "專案工時",
        "change_requests": "變更單 (CR)",
        "resources": "資源池",
        "utilization": "稼動率",
        "kpi": "KPI 儀表板",
        "settlements": "月度結算",
        "reports": "自訂報表",
        "users": "帳號管理",
        "cost_rates": "費率設定",
        "custom_fields": "自訂欄位",
        "system_settings": "系統設定"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('pmp_language') || "zh",
    fallbackLng: "zh",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
