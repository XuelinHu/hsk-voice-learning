package com.hskvoice.hsk_dialogue_studio

import java.io.File

internal object RecordingRetention {
    internal data class Limits(
        val maxFiles: Int = 20,
        val maxBytes: Long = 40L * 1024 * 1024,
        val retentionMs: Long = 7L * 24 * 60 * 60 * 1000,
    )

    fun prune(
        directory: File,
        now: Long = System.currentTimeMillis(),
        limits: Limits = Limits(),
    ) {
        val files = directory.listFiles { file ->
            file.isFile && file.name.matches(Regex("practice_\\d+\\.wav"))
        }?.sortedBy { it.lastModified() } ?: return
        var totalBytes = files.sumOf { it.length() }
        var remainingFiles = files.size
        for (file in files) {
            val expired = now - file.lastModified() > limits.retentionMs
            if (!expired && remainingFiles <= limits.maxFiles && totalBytes <= limits.maxBytes) break
            val fileBytes = file.length()
            if (file.delete()) {
                totalBytes -= fileBytes
                remainingFiles -= 1
            }
        }
    }
}
