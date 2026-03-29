/** Repo root (where query.json, clients/, scripts/ live). */
export declare const ROOT_DIR: string;
/** Static assets (HTML, JS, CSS). */
export declare const STATIC_DIR: string;
export declare const PORT: number;
export declare const BACKUP_COUNT = 5;
export declare const TIME_ENTRIES_FILENAME = "time_entries.json";
export declare const PARSED_EMAILS_FILENAME = "parsed_emails.json";
export declare const PIPELINE_LOG_FILENAME = "pipeline.log";
export declare const PIPELINE_STEPS: readonly [{
    readonly name: "Download Gmail messages";
    readonly script: "scripts/0_download_test_data.py";
}, {
    readonly name: "Decode raw emails";
    readonly script: "scripts/1_decode_raw_email_worker.py";
}, {
    readonly name: "Generate time entries";
    readonly script: "scripts/2_generate_time_entries.py";
}];
export declare const MIME_TYPES: Record<string, string>;
//# sourceMappingURL=config.d.ts.map