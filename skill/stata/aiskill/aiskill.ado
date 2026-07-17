*! version v1.1 17jul2026

program define aiskill, rclass
    version 13
    syntax [anything(name=command)] [, FORCE]

    local client_version "v1.1"
    local protocol_version "1"
    local command = lower(strtrim(`"`command'"'))
    if `"`command'"' == "" local command "setup"
    if !inlist(`"`command'"', "setup", "status", "version") {
        display as error "aiskill: unknown subcommand `command'"
        display as error "Usage: aiskill [setup|status|version] [, force]"
        exit 198
    }
    if `"`command'"' != "setup" & `"`force'"' != "" {
        display as error "aiskill: force is allowed only with aiskill setup"
        exit 198
    }

    _aiskill_language
    local zh = r(zh)

    if `"`command'"' == "version" {
        display as text "aiskill `client_version'"
        display as text "Protocol: `protocol_version'"
        display as text "Minimum Stata version: 13"
        return local status "ok"
        return local client_version "`client_version'"
        return local protocol_version "`protocol_version'"
        exit
    }

    tempfile status_file
    local active_port 19522
    capture quietly copy ///
        "http://127.0.0.1:19522/status?format=stata" ///
        `"`status_file'"', replace
    local connected = (_rc == 0)
    if `connected' {
        quietly _aiskill_read_response using `"`status_file'"'
        local connected 0
        if r(valid) == 1 {
            if `"`r(service)'"' == "stata-ai-skill" & ///
                `"`r(protocolVersion)'"' == "`protocol_version'" local connected 1
        }
    }

    if !`connected' {
        if `zh' display as error "未连接到 Stata AI Skill。请确保 agent 已启动 19522 服务。"
        else display as error "Could not connect to Stata AI Skill on port 19522. Ask the agent to start the service."
        return local status "offline"
        return scalar configured = 0
        exit 601
    }
    local skill_version `"`r(skillVersion)'"'
    local setup_token `"`r(setupToken)'"'
    local configured = real(`"`r(configured)'"')
    local installation_path `"`r(installationPath)'"'
    local stata_edition `"`r(stataEdition)'"'
    local session_active = real(`"`r(sessionActive)'"')
    local setup_phase `"`r(setupPhase)'"'

    local print_path `"`installation_path'"'
    local print_edition `"`stata_edition'"'
    if `"`print_path'"' == "" local print_path "__AISKILL_EMPTY__"
    if `"`print_edition'"' == "" local print_edition "__AISKILL_EMPTY__"
    _aiskill_print_configuration, zh(`zh') configured(`configured') ///
        port(`active_port') extension(`"`skill_version'"') ///
        path(`"`print_path'"') edition(`"`print_edition'"') ///
        sessionactive(`session_active') phase(`"`setup_phase'"')

    return local status "ok"
    return scalar port = `active_port'
    return scalar configured = `configured'
    return local skill_version `"`skill_version'"'
    return local installation_path `"`installation_path'"'

    if `"`command'"' == "status" exit

    if `configured' & `"`force'"' == "" {
        local aiskill_confirm ""
        if `zh' {
            display as text _newline "检测到 Stata AI Skill 已有配置。"
            display as result "是否使用当前运行的 Stata 重新配置？继续请输入 y，取消请输入 n：" _request(_aiskill_confirm)
        }
        else {
            display as text _newline "Stata AI Skill is already configured."
            display as result "Reconfigure using the currently running Stata? Enter y to continue or n to cancel: " _request(_aiskill_confirm)
        }
        local answer = lower(strtrim(`"`aiskill_confirm'"'))
        if !inlist(`"`answer'"', "y", "yes", "1") {
            if `zh' display as text "已取消重新配置，现有配置未发生变化。"
            else display as text "Reconfiguration cancelled. The existing configuration was not changed."
            return local status "cancelled"
            return scalar configured = 1
            exit
        }
    }

    local stata_os `"`c(os)'"'
    local stata_version `"`c(stata_version)'"'
    quietly _aiskill_detect_flavor
    local stata_flavor `"`r(flavor)'"'
    local machine_type `"`c(machine_type)'"'
    local sysdir_stata `"`c(sysdir_stata)'"'

    if `zh' {
        display as text _newline "当前运行的 Stata"
        display as text "  Stata 版本：`stata_version'"
        display as text "  Stata 类型：`stata_flavor'"
        display as text "  安装目录：`sysdir_stata'"
        display as text _newline "正在配置……"
    }
    else {
        display as text _newline "Currently running Stata"
        display as text "  Stata version: `stata_version'"
        display as text "  Stata flavor: `stata_flavor'"
        display as text "  Installation directory: `sysdir_stata'"
        display as text _newline "Configuring..."
    }

    foreach field in setup_token client_version stata_os stata_version stata_flavor machine_type sysdir_stata {
        mata: st_local("encoded_`field'", _aiskill_urlencode(st_local("`field'")))
    }
    local setup_url "http://127.0.0.1:`active_port'/setup?protocolVersion=`protocol_version'"
    local setup_url "`setup_url'&setupToken=`encoded_setup_token'"
    local setup_url "`setup_url'&clientVersion=`encoded_client_version'"
    local setup_url "`setup_url'&os=`encoded_stata_os'"
    local setup_url "`setup_url'&stataVersion=`encoded_stata_version'"
    local setup_url "`setup_url'&flavor=`encoded_stata_flavor'"
    local setup_url "`setup_url'&machineType=`encoded_machine_type'"
    local setup_url "`setup_url'&sysdirStata=`encoded_sysdir_stata'"

    tempfile setup_file
    capture quietly copy `"`setup_url'"' `"`setup_file'"', replace
    if _rc {
        local copy_rc = _rc
        if `zh' display as error "配置请求失败。请重新运行 aiskill setup。"
        else display as error "The configuration request failed. Run aiskill setup again."
        return local status "error"
        exit `copy_rc'
    }
    quietly _aiskill_read_response using `"`setup_file'"'
    if r(valid) != 1 | `"`r(success)'"' != "1" {
        if `zh' display as error "Stata AI Skill 未接受配置请求。"
        else display as error "Stata AI Skill did not accept the configuration request."
        return local status "error"
        exit 498
    }

    local resolved_path `"`r(resolvedPath)'"'
    if `zh' display as result "配置已发送，请等待 agent 确认结果。"
    else display as result "Configuration sent. Wait for the agent to confirm the result."
    return local status "sent"
    return local transport "get"
    return local resolved_path `"`resolved_path'"'
    return scalar port = `active_port'
    return scalar configured = `configured'
    return local skill_version `"`skill_version'"'
    return local installation_path `"`installation_path'"'
end

program define _aiskill_detect_flavor, rclass
    version 13
    local edition ""
    if c(MP) {
        local edition "MP"
    }
    else if c(SE) {
        local edition "SE"
    }
    else {
        capture local edition = upper(strtrim(c(edition_real)))
        local edition_rc = _rc
        if `edition_rc' | `"`edition'"' == "" {
            capture local edition = upper(strtrim(c(flavor)))
            if _rc local edition ""
        }
    }
    return local flavor `"`edition'"'
end

program define _aiskill_language, rclass
    version 13
    local locale ""
    capture local locale `"`c(locale_ui)'"'
    if _rc capture local locale `"`c(locale)'"'
    local locale = lower(`"`locale'"')
    return scalar zh = ///
        strpos(`"`locale'"', "chinese") > 0 | ///
        strpos(`"`locale'"', "zh_") > 0 | ///
        strpos(`"`locale'"', "zh-") > 0
end

program define _aiskill_read_response, rclass
    version 13
    syntax using/
    tempname handle
    file open `handle' using `"`using'"', read text
    file read `handle' line
    if strtrim(`"`line'"') != "AISKILL/1" {
        file close `handle'
        return scalar valid = 0
        exit
    }
    local keys ""
    file read `handle' line
    while r(eof) == 0 {
        local equals = strpos(`"`line'"', "=")
        if `equals' > 1 {
            local key = substr(`"`line'"', 1, `equals' - 1)
            local value = substr(`"`line'"', `equals' + 1, .)
            capture local result_`key' `"`value'"'
            if !_rc local keys `"`keys' `key'"'
        }
        file read `handle' line
    }
    file close `handle'
    return scalar valid = 1
    foreach key of local keys {
        return local `key' `"`result_`key''"'
    }
end

program define _aiskill_print_configuration
    version 13
    syntax, ZH(integer) CONFIGURED(integer) PORT(integer) ///
        EXTension(string) PATH(string) EDITION(string) ///
        SESSIONACTIVE(integer) PHASE(string)

    local display_path `"`path'"'
    local display_edition `"`edition'"'
    if `"`display_path'"' == "__AISKILL_EMPTY__" local display_path ""
    if `"`display_edition'"' == "__AISKILL_EMPTY__" local display_edition ""
    if !`configured' {
        if `zh' {
            local display_path "未配置"
            local display_edition "未配置"
        }
        else {
            local display_path "Not configured"
            local display_edition "Not configured"
        }
    }
    if `zh' {
        local configured_label = cond(`configured', "已配置", "尚未配置")
        display as text "Stata AI Skill 当前配置"
        display as text "  Skill 版本：`extension'"
        display as text "  连接端口：`port'"
        display as text "  配置状态：`configured_label'"
        display as text `"  Stata 位置：`display_path'"'
        display as text `"  Stata 版本：`display_edition'"'
        display as text "  会话活动：`sessionactive'"
        display as text "  Setup 阶段：`phase'"
    }
    else {
        local configured_label = cond(`configured', "Configured", "Not configured")
        display as text "Current Stata AI Skill configuration"
        display as text "  Skill version: `extension'"
        display as text "  Connection port: `port'"
        display as text "  Configuration: `configured_label'"
        display as text `"  Stata location: `display_path'"'
        display as text `"  Stata edition: `display_edition'"'
        display as text "  Session active: `sessionactive'"
        display as text "  Setup phase: `phase'"
    }
end

mata:
string scalar _aiskill_urlencode(string scalar value)
{
    real scalar i, code
    string scalar character, encoded, hex
    encoded = ""
    hex = "0123456789ABCDEF"
    for (i = 1; i <= strlen(value); i++) {
        character = substr(value, i, 1)
        code = ascii(character)
        if ((code >= 48 & code <= 57) |
            (code >= 65 & code <= 90) |
            (code >= 97 & code <= 122) |
            character == "-" | character == "." |
            character == "_" | character == "~") {
            encoded = encoded + character
        }
        else {
            encoded = encoded + "%" +
                substr(hex, floor(code / 16) + 1, 1) +
                substr(hex, mod(code, 16) + 1, 1)
        }
    }
    return(encoded)
}
end
