#include "stplugin.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef void (*saio_write_fn)(const void *, size_t);

typedef struct {
    saio_write_fn write;
    unsigned char *data;
    size_t capacity;
    size_t used;
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
    while (length) {
        size_t available = writer->capacity - writer->used;
        size_t amount = length < available ? length : available;
        memcpy(writer->data + writer->used, bytes, amount);
        writer->used += amount;
        bytes += amount;
        length -= amount;
        if (writer->used == writer->capacity) flush_writer(writer);
    }
    return 0;
}

STDLL stata_call(int argc, char *argv[])
{
    writer_t writer;
    uintptr_t callback_address;
    uint64_t observation_count = 0;
    uint32_t variable_count;
    ST_int variable;
    ST_int observation;

    if (argc < 1 || !argv[0]) return 198;
    callback_address = (uintptr_t)strtoull(argv[0], NULL, 16);
    if (!callback_address) return 198;
    memset(&writer, 0, sizeof(writer));
    writer.write = (saio_write_fn)callback_address;
    writer.capacity = 1024 * 1024;
    writer.data = (unsigned char *)malloc(writer.capacity);
    if (!writer.data) return 909;

    for (observation = SF_in1(); observation <= SF_in2(); observation++) {
        if (SF_ifobs(observation)) observation_count++;
    }
    variable_count = (uint32_t)SF_nvars();
    write_bytes(&writer, "SAIODV1\0", 8);
    write_bytes(&writer, &observation_count, sizeof(observation_count));
    write_bytes(&writer, &variable_count, sizeof(variable_count));

    for (variable = 1; variable <= (ST_int)variable_count; variable++) {
        uint8_t kind = SF_var_is_string(variable) ? 1 : 0;
        write_bytes(&writer, &kind, sizeof(kind));
        for (observation = SF_in1(); observation <= SF_in2(); observation++) {
            if (!SF_ifobs(observation)) continue;
            if (SW_stopflag) {
                free(writer.data);
                return 1;
            }
            if (!kind) {
                ST_double value = 0;
                uint8_t missing;
                ST_retcode rc = SF_vdata(variable, observation, &value);
                if (rc) {
                    free(writer.data);
                    return rc;
                }
                missing = SF_is_missing(value) ? 1 : 0;
                write_bytes(&writer, &missing, sizeof(missing));
                write_bytes(&writer, &value, sizeof(value));
            } else {
                uint32_t length = 0;
                char *text;
                ST_retcode rc;
                if (SF_var_is_strl(variable)) {
                    ST_int data_length = SF_sdatalen(variable, observation);
                    if (data_length < 0) data_length = 0;
                    text = (char *)malloc((size_t)data_length + 1);
                    if (!text) {
                        free(writer.data);
                        return 909;
                    }
                    rc = SF_strldata(variable, observation, text, data_length + 1);
                    length = rc ? 0 : (uint32_t)data_length;
                } else {
                    text = (char *)malloc(2046);
                    if (!text) {
                        free(writer.data);
                        return 909;
                    }
                    text[0] = '\0';
                    rc = SF_sdata(variable, observation, text);
                    length = rc ? 0 : (uint32_t)strlen(text);
                }
                write_bytes(&writer, &length, sizeof(length));
                if (length) write_bytes(&writer, text, length);
                free(text);
            }
        }
    }
    flush_writer(&writer);
    free(writer.data);
    return 0;
}
