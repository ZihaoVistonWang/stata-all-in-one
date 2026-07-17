{smcl}
{* *! version v1.1 17jul2026}{...}
{title:Title}

{phang}
{bf:aiskill} {hline 2} Configure Stata AI Skill from a separately opened Stata application

{title:Syntax}

{p 8 16 2}{cmd:aiskill} [{cmd:setup}] [{cmd:,} {opt force}]{p_end}
{p 8 16 2}{cmd:aiskill status}{p_end}
{p 8 16 2}{cmd:aiskill version}{p_end}

{title:Description}

{pstd}
{cmd:aiskill setup} connects to the local Stata AI Skill service on fixed port
19522 and reports the installation information of the currently running Stata.
It is the manual fallback when automatic installation discovery fails.

{pstd}
Run this command in a separately opened GUI Stata. Do not run it from the
Stata AI Skill session itself. After the configuration is sent, wait for the
agent to confirm the final result.

{pstd}
{cmd:aiskill status} displays the current service configuration without
changing it. {cmd:aiskill version} displays protocol information.

{title:Option}

{phang}
{opt force} skips the confirmation when the service already has a configured
Stata installation. It is valid only with {cmd:aiskill setup}.

{title:Examples}

{phang2}{cmd:. aiskill setup}{p_end}
{phang2}{cmd:. aiskill status}{p_end}
{phang2}{cmd:. aiskill setup, force}{p_end}

{title:Requirements}

{pstd}
Stata 13 or newer and a running Stata AI Skill service at
http://127.0.0.1:19522.
