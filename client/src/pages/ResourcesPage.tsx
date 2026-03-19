import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Users, Code, LineChart, Pencil, X, Check } from "lucide-react";

const SKILLS_OPTIONS = [
    "React", "Node.js", "Azure", "TypeScript", "Python", "SQL",
    "Docker", "Kubernetes", "DevOps", "AI/ML", "Power BI", "SharePoint",
    "M365", "AWS", "GCP", "Security", "Networking", "Project Management"
];

const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
type SkillLevel = typeof SKILL_LEVELS[number];

interface ResourceSkill { name: string; level: SkillLevel; }
interface ResourceEdit {
    department: string;
    skills: ResourceSkill[];
}

export function ResourcesPage() {
    const { data: usersData, isLoading } = trpc.users.list.useQuery({ limit: 100 });
    const { data: utilizationData } = trpc.analytics.getUtilization.useQuery();
    const updateUserMutation = trpc.users.updateUser.useMutation();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editData, setEditData] = useState<ResourceEdit>({ department: "", skills: [] });
    const [isSaving, setIsSaving] = useState(false);

    // Local skill overrides (since skills aren't in DB yet, we save client-side per session)
    const [localSkills, setLocalSkills] = useState<Record<string, ResourceSkill[]>>({});
    const [localDepts, setLocalDepts] = useState<Record<string, string>>({});

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">載入資源池資料中...</div>;
    }

    const resources = usersData?.items?.filter(
        (u: any) => u.role === 'tech' || u.role === 'presales' || u.role === 'pm' ||
            (u.roles && (u.roles.includes('tech') || u.roles.includes('presales') || u.roles.includes('pm')))
    );

    const openEdit = (user: any) => {
        const existingSkills = localSkills[user.id] ?? [
            { name: "React", level: "advanced" as SkillLevel },
            { name: "Node.js", level: "expert" as SkillLevel },
            { name: "Azure", level: "intermediate" as SkillLevel },
        ];
        setEditData({
            department: localDepts[user.id] ?? user.department ?? "",
            skills: [...existingSkills],
        });
        setEditingId(user.id);
    };

    const handleSave = async (userId: string) => {
        setIsSaving(true);
        try {
            if (editData.department) {
                await updateUserMutation.mutateAsync({ id: userId, department: editData.department });
            }
            setLocalSkills(s => ({ ...s, [userId]: editData.skills }));
            setLocalDepts(s => ({ ...s, [userId]: editData.department }));
            setEditingId(null);
        } catch {
            // still save locally even if API fails
            setLocalSkills(s => ({ ...s, [userId]: editData.skills }));
            setLocalDepts(s => ({ ...s, [userId]: editData.department }));
            setEditingId(null);
        }
        setIsSaving(false);
    };

    const addSkill = () => {
        const unused = SKILLS_OPTIONS.find(s => !editData.skills.find(sk => sk.name === s));
        if (unused) setEditData(d => ({ ...d, skills: [...d.skills, { name: unused, level: "intermediate" }] }));
    };

    const removeSkill = (i: number) => {
        setEditData(d => ({ ...d, skills: d.skills.filter((_, idx) => idx !== i) }));
    };

    const updateSkill = (i: number, field: keyof ResourceSkill, value: string) => {
        setEditData(d => ({
            ...d,
            skills: d.skills.map((sk, idx) => idx === i ? { ...sk, [field]: value } : sk)
        }));
    };

    const levelColor: Record<SkillLevel, string> = {
        beginner: "bg-blue-100 text-blue-700",
        intermediate: "bg-amber-100 text-amber-700",
        advanced: "bg-purple-100 text-purple-700",
        expert: "bg-green-100 text-green-700",
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-xl shadow-sm border border-border/50">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">可派工資源池</h2>
                    <p className="text-muted-foreground mt-1">查看所有技術與協銷人員的稼動率及技能矩陣</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {resources?.map((user: any) => {
                    const userUt = utilizationData?.find((u: any) => u.id === user.id);
                    const utilization = userUt?.utilizationRate || 0;
                    const skills = localSkills[user.id] ?? [
                        { name: "React", level: "advanced" as SkillLevel },
                        { name: "Node.js", level: "expert" as SkillLevel },
                        { name: "Azure", level: "intermediate" as SkillLevel },
                    ];
                    const department = localDepts[user.id] ?? user.department ?? "技術處";

                    return (
                        <div key={user.id} className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                            {/* Edit Button */}
                            <button
                                onClick={() => openEdit(user)}
                                className="absolute top-3 right-3 p-1.5 rounded-lg bg-muted/0 hover:bg-muted text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                                title="編輯資源資訊"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold mr-3">
                                        {user.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold">{user.name}</h3>
                                        <p className="text-xs text-muted-foreground">{department}</p>
                                    </div>
                                </div>
                                <span className="flex h-2 w-2 relative mt-1">
                                    {utilization > 80 ? (
                                        <>
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" title="高負載"></span>
                                        </>
                                    ) : (
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" title="正常"></span>
                                    )}
                                </span>
                            </div>

                            <div className="space-y-4">
                                <div className="flex flex-wrap gap-1 border-b border-border/50 pb-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary capitalize">
                                        {user.role}
                                    </span>
                                    {user.roles?.filter((r: string) => r !== user.role).map((r: string) => (
                                        <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground border capitalize">
                                            {r}
                                        </span>
                                    ))}
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-muted-foreground flex items-center"><LineChart className="w-3.5 h-3.5 mr-1" /> 當月稼動率</span>
                                        <span className="font-medium text-foreground">{utilization}%</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2">
                                        <div className={`h-2 rounded-full ${utilization > 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${utilization}%` }}></div>
                                    </div>
                                </div>

                                <div className="pt-1">
                                    <p className="text-xs text-muted-foreground mb-2 flex items-center">
                                        <Code className="w-3.5 h-3.5 mr-1" /> 專長技能
                                    </p>
                                    <div className="space-y-1.5">
                                        {skills.slice(0, 3).map(skill => (
                                            <div key={skill.name} className="flex justify-between items-center text-xs">
                                                <span className="font-medium">{skill.name}</span>
                                                <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${levelColor[skill.level as SkillLevel] ?? 'bg-muted text-muted-foreground'}`}>
                                                    {skill.level}
                                                </span>
                                            </div>
                                        ))}
                                        {skills.length === 0 && <p className="text-xs text-muted-foreground italic">尚未設定技能</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {(!resources || resources.length === 0) && (
                    <div className="col-span-full p-12 text-center bg-muted/30 border border-dashed rounded-xl">
                        <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <h3 className="text-lg font-medium">尚無技術或協銷人員資源</h3>
                        <p className="text-muted-foreground mt-1">請管理員至用戶管理建立帳號</p>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingId !== null && (() => {
                const user = resources?.find((u: any) => u.id === editingId);
                if (!user) return null;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-bold flex items-center">
                                    <Pencil className="w-5 h-5 mr-2 text-primary" />
                                    編輯資源：{user.name}
                                </h2>
                                <button onClick={() => setEditingId(null)} className="p-1 rounded-full hover:bg-muted transition-colors">
                                    <X className="w-5 h-5 text-muted-foreground" />
                                </button>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium mb-1">所屬部門</label>
                                    <input
                                        type="text" value={editData.department}
                                        onChange={e => setEditData(d => ({ ...d, department: e.target.value }))}
                                        placeholder="例：技術處、售前技術部"
                                        className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium">專長技能</label>
                                        <button
                                            onClick={addSkill}
                                            className="text-xs text-primary hover:text-primary/80 flex items-center px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                                        >
                                            + 新增技能
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {editData.skills.map((sk, i) => (
                                            <div key={i} className="flex items-center space-x-2">
                                                <select
                                                    value={sk.name}
                                                    onChange={e => updateSkill(i, 'name', e.target.value)}
                                                    className="flex-1 border border-border rounded-lg px-2 py-1.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                >
                                                    {SKILLS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                                <select
                                                    value={sk.level}
                                                    onChange={e => updateSkill(i, 'level', e.target.value)}
                                                    className="w-32 border border-border rounded-lg px-2 py-1.5 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                                >
                                                    {SKILL_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                                </select>
                                                <button
                                                    onClick={() => removeSkill(i)}
                                                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {editData.skills.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed border-border/50 rounded-lg">尚未新增技能，點選「新增技能」開始設定</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 pt-2">
                                <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">取消</button>
                                <button
                                    onClick={() => handleSave(editingId)}
                                    disabled={isSaving}
                                    className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center"
                                >
                                    {isSaving ? (
                                        <><span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />儲存中...</>
                                    ) : (
                                        <><Check className="w-4 h-4 mr-1" />儲存變更</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
