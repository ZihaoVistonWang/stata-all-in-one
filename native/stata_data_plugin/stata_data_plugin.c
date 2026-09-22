#include "stplugin.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef void (*saio_write_fn)(const void *, size_t);

/* Return codes reported back to Stata through the plugin call. */
#define SAIO_OK 0
#define SAIO_ERR_ARGS 198
#define SAIO_ERR_ALLOC 909
/* The requested capture exceeds the configured budget. Failing in a controlled
   way is essential: letting data grow without limit can exhaust the address
   space of the Stata worker (or the Extension Host it talks to) and take the
   whole session down with it. */
#define SAIO_ERR_BUDGET 9091

/* Upper bound for one dataset capture. The extension reads at most one window
   of rows at a time, so a capture larger than this indicates a request that
   should have been windowed. */
#define SAIO_DEFAULT_BUDGET ((size_t)512 * 1024 * 1024)

typedef struct {
    saio_write_fn write;
    unsigned char *data;
    size_t capacity;
    size_t used;
    size_t written;
    size_t budget;
    int overflow;
} writer_t;

static int flush_writer(writer_t *writer)
{
    if (!writer->used) return 0;
    writer->write(writer->data, writer->used);
    writer->used = 0;
    return 0;
}

static int write_bytes(writer_t *writer, const void *source, size_t length)
{
    const unsigned char *bytes = (const unsigned char *)source;
    if (writer->overflow) return SAIO_ERR_BUDGET;
    if (writer->written + length > writer->budget) {
        writer->overflow = 1;
        return SAIO_ERR_BUDGET;
    }
    while (length) {
        size_t available = writer->capacity - writer->used;
        size_t amount = length < available ? length : available;
        memcpy(writer->data + writer->used, bytes, amount);
        writer->used += amount;
        writer->written += amount;
        bytes += amount;
        length -= amount;
        if (writer->used == writer->capacity) flush_writer(writer);
    }
    return 0;
}

static void release_writer(writer_t *writer)
{
    if (writer->data) {
        free(writer->data);
        writer->data = NULL;
    }
}

/*
 * Plugin entry point.
 *
 *   argv[0]                    callback address (hex)
 *   argv[1] (optional)         byte budget for this capture
 *
 * The observation range to read is the one Stata itself set for the call, i.e.
 * `SF_in1()` .. `SF_in2()`. The extension windows large datasets by issuing
 * `plugin call ... in <from>/<to>`, so the capture buffer is bounded by the
 * requested window instead of by the size of the dataset.
 */
STDLL stata_call(int argc, char *argv[])
{
    writer_t writer;
    uintptr_t callback_address;
    uint64_t observation_count = 0;
    uint32_t variable_count;
    ST_int variable;
    ST_int observation;
    int rc;

    if (argc < 1 || !argv[0]) return SAIO_ERR_ARGS;
    callback_address = (uintptr_t)strtoull(argv[0], NULL, 16);
    if (!callback_address) return SAIO_ERR_ARGS;

    memset(&writer, 0, sizeof(writer));
    writer.write = (saio_write_fn)callback_address;
    writer.capacity = 1024 * 1024;
    writer.budget = SAIO_DEFAULT_BUDGET;
    if (argc > 1 && argv[1]) {
        unsigned long long requested = strtoull(argv[1], NULL, 10);
        if (requested > 0) writer.budget = (size_t)requested;
    }
    writer.data = (unsigned char *)malloc(writer.capacity);
    if (!writer.data) return SAIO_ERR_ALLOC;

    for (observation = SF_in1(); observation <= SF_in2(); observation++) {
        if (SW_stopflag) {
            release_writer(&writer);
            return 1;
        }
        if (SF_ifobs(observation)) observation_count++;
    }
    variable_count = (uint32_t)SF_nvars();

    if (write_bytes(&writer, "SAIODV1\0", 8) != SAIO_OK
        || write_bytes(&writer, &observation_count, sizeof(observation_count)) != SAIO_OK
        || write_bytes(&writer, &variable_count, sizeof(variable_count)) != SAIO_OK) {
        release_writer(&writer);
        return SAIO_ERR_BUDGET;
    }

    for (variable = 1; variable <= (ST_int)variable_count; variable++) {
        uint8_t kind = SF_var_is_string(variable) ? 1 : 0;
        if (write_bytes(&writer, &kind, sizeof(kind)) != SAIO_OK) {
            release_writer(&writer);
            return SAIO_ERR_BUDGET;
        }
        for (observation = SF_in1(); observation <= SF_in2(); observation++) {
            if (!SF_ifobs(observation)) continue;
            if (SW_stopflag) {
                release_writer(&writer);
                return 1;
            }
            if (!kind) {
                ST_double value = 0;
                uint8_t missing;
                ST_retcode vrc = SF_vdata(variable, observation, &value);
                if (vrc) {
                    release_writer(&writer);
                    return vrc;
                }
                missing = SF_is_missing(value) ? 1 : 0;
                if (write_bytes(&writer, &missing, sizeof(missing)) != SAIO_OK
                    || write_bytes(&writer, &value, sizeof(value)) != SAIO_OK) {
                    release_writer(&writer);
                    return SAIO_ERR_BUDGET;
                }
            } else {
                uint32_t length = 0;
                char *text;
                ST_retcode vrc;
                if (SF_var_is_strl(variable)) {
                    ST_int data_length = SF_sdatalen(variable, observation);
                    if (data_length < 0) data_length = 0;
                    text = (char *)malloc((size_t)data_length + 1);
                    if (!text) {
                        release_writer(&writer);
                        return SAIO_ERR_ALLOC;
                    }
                    /* SF_strldata fills the buffer and NUL-terminates it, but its
                       return value is the written byte count rather than a status
                       code: it is the string length for a non-empty value and 0
                       for an empty one. Reading the length back out of the buffer
                       is the only reading that survives both cases — treating a
                       non-zero return as failure silently turned every non-empty
                       strL value into "". */
                    vrc = SF_strldata(variable, observation, text, data_length + 1);
                    length = vrc < 0 ? 0 : (uint32_t)strlen(text);
                } else {
                    text = (char *)malloc(2046);
                    if (!text) {
                        release_writer(&writer);
                        return SAIO_ERR_ALLOC;
                    }
                    text[0] = '\0';
                    vrc = SF_sdata(variable, observation, text);
                    length = vrc ? 0 : (uint32_t)strlen(text);
                }
                if (write_bytes(&writer, &length, sizeof(length)) != SAIO_OK
                    || (length && write_bytes(&writer, text, length) != SAIO_OK)) {
                    free(text);
                    release_writer(&writer);
                    return SAIO_ERR_BUDGET;
                }
                free(text);
            }
        }
    }

    rc = flush_writer(&writer);
    release_writer(&writer);
    return rc;
}
