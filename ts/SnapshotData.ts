interface BlockData {
	AttackBlockPct: number;
}
interface KillsData {
	Total: number;
	Area: number;
}
interface RunsData {
	RunsToNext?: number;
	TotalRuns?: number;
}
interface EvasionData {
	Rating: number;
	ChanceToEvade: number;
}
interface ArmorData {
	Rating: number;
	DisplayReduction: number;
}
interface DataPoint {
	x: Date;
	y: number;
    preTitles?: string[];
}
interface DefenseData {
	Armor: ArmorData;
	Evasion: EvasionData;
	Block: BlockData;
}
interface AreaData {
	Name: string;
	Level: number;
	Act: number;
	Difference: number;
}
interface DatasetToggle {
	label: string;
	color: string;
	visible: boolean;
	index: number;
}
interface ResistanceDetail {
	Capped: number;
	Uncapped: number;
	Max: number;
	Diff: number;
}
interface ResistanceData {
	Fire: ResistanceDetail;
	Cold: ResistanceDetail;
	Lightning: ResistanceDetail;
	Chaos: ResistanceDetail;
}
interface PlayerData {
	Level: number;
	Xp: number;
	MaxHP: number;
	MaxES: number;
	MaxMana: number;
	XpData: XpData;
	Runs: RunsData;
	Kills: KillsData;
}
interface XpData {
	ProgressPercent: number;
	XpGained: number;
	LevelPercent: number;
	XpPerHour: number;
	XpPerMobAvg?: number;
	TimeToLevelSeconds?: number;
}
interface SnapshotData {
	SnapshotTime: number;
	AreaTimeSeconds: number;
	StartArea: AreaData;
	EndArea: AreaData;
	Player: PlayerData;
	Resistances: ResistanceData;
	Defenses: DefenseData;
}