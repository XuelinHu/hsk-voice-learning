package com.hskvoice.hsk_mission_lab

import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RecordingRetentionTest {
    private lateinit var directory: File

    @Before
    fun setUp() {
        directory = Files.createTempDirectory("hsk-recordings").toFile()
    }

    @After
    fun tearDown() {
        directory.deleteRecursively()
    }

    @Test
    fun `deletes expired files but keeps exact retention boundary and unrelated files`() {
        val expired = record("practice_1.wav", 1, modified = 8_899)
        val boundary = record("practice_2.wav", 1, modified = 8_900)
        val unrelated = record("notes.wav", 1, modified = 1)

        RecordingRetention.prune(directory, now = 9_000, limits = limits(retentionMs = 100))

        assertFalse(expired.exists())
        assertTrue(boundary.exists())
        assertTrue(unrelated.exists())
    }

    @Test
    fun `keeps newest files within the count limit`() {
        val oldest = record("practice_1.wav", 10, modified = 1)
        val middle = record("practice_2.wav", 10, modified = 2)
        val newest = record("practice_3.wav", 10, modified = 3)

        RecordingRetention.prune(directory, now = 10, limits = limits(maxFiles = 2))

        assertFalse(oldest.exists())
        assertTrue(middle.exists())
        assertTrue(newest.exists())
    }

    @Test
    fun `evicts oldest files until total bytes are within limit`() {
        val oldest = record("practice_1.wav", 40, modified = 1)
        val middle = record("practice_2.wav", 40, modified = 2)
        val newest = record("practice_3.wav", 40, modified = 3)

        RecordingRetention.prune(directory, now = 10, limits = limits(maxBytes = 70))

        assertFalse(oldest.exists())
        assertFalse(middle.exists())
        assertTrue(newest.exists())
    }

    @Test
    fun `does not traverse nested directories or delete other file names`() {
        val nested = File(directory, "nested").apply { mkdir() }
        val nestedRecording = File(nested, "practice_1.wav").apply { writeBytes(ByteArray(1)) }
        val unrelatedRecording = record("practice-old.wav", 1, modified = 1)

        RecordingRetention.prune(directory, now = 10, limits = limits(retentionMs = 1))

        assertTrue(nestedRecording.exists())
        assertTrue(unrelatedRecording.exists())
    }

    private fun record(name: String, bytes: Int, modified: Long): File =
        File(directory, name).apply {
            writeBytes(ByteArray(bytes))
            setLastModified(modified)
        }

    private fun limits(
        maxFiles: Int = 20,
        maxBytes: Long = Long.MAX_VALUE,
        retentionMs: Long = Long.MAX_VALUE,
    ) = RecordingRetention.Limits(maxFiles, maxBytes, retentionMs)
}
