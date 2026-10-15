# Shared developer bridge. Generated scenes end with return and may call renpi_choice.
default renpi_branch_id = None
default renpi_anchor_id = None
default renpi_pending_adoption = None

init -10 python:
    import renpi_bridge

    def _renpi_client():
        return renpi_bridge.get_client(config.basedir)

    def _renpi_action(method, *args):
        method(*args)

    def _renpi_reload(source=None):
        global renpi_pending_adoption, renpi_branch_id, renpi_anchor_id
        c = _renpi_client()
        if source is None:
            renpi_pending_adoption = dict(c.adoption)
        else:
            renpi_pending_adoption = None
            renpi_branch_id, renpi_anchor_id = source
            c.target = None
        # Reload from the interaction: replaying a reload Python statement loops.
        renpy.retain_after_load()
        renpy.reload_script()

    def _renpi_after_load():
        c = _renpi_client()
        c.record_load(renpi_pending_adoption)

    def _renpi_interact():
        if renpi_branch_id and renpi_anchor_id:
            c = _renpi_client()
            if not renpi_pending_adoption:
                c.observe(renpi_branch_id, renpi_anchor_id)

    def _renpi_tick():
        global renpi_branch_id, renpi_anchor_id
        c = _renpi_client()
        c.pump()
        if c.navigation:
            renpi_branch_id = c.navigation["branch_id"]
            renpi_anchor_id = c.navigation["anchor_id"]
            c.position = (renpi_branch_id, renpi_anchor_id)
            c.synced = c.position
            c.navigation = None
            renpy.retain_after_load()
        renpy.restart_interaction()

    config.after_load_callbacks.append(_renpi_after_load)
    config.interact_callbacks.append(_renpi_interact)
    config.overlay_screens.append("renpi_bridge_sync")

screen renpi_bridge_sync():
    if renpi_branch_id and not renpy.get_screen("renpi_bridge_choice"):
        timer 0.2 repeat True action Function(_renpi_tick)

screen renpi_bridge_choice(anchor, choices, source):
    modal True
    timer 0.2 repeat True action Function(_renpi_tick)
    $ target = _renpi_client().state.get("branches", {}).get(_renpi_client().target or (renpi_branch_id if (renpi_branch_id, renpi_anchor_id) != source else None), {}) if _renpi_client().state else {}
    $ available = renpi_bridge.branch_actions(target)
    frame:
        xalign 0.5
        yalign 0.5
        xmaximum 1000
        vbox:
            spacing 14
            text "Ren'Pi — [anchor]"
            if _renpi_client().error:
                text _renpi_client().error substitute False
            # Background status polls should not flash a waiting message.
            elif _renpi_client().busy and (_renpi_client().pending or not _renpi_client().state):
                text "Waiting for the bridge…"
            elif _renpi_client().pending:
                text "An unresolved request is retained. Reconnect resends the same request ID."
            elif target:
                text ("Branch: " + str(target.get("status", "waiting"))) substitute False
            else:
                text " "
            if _renpi_client().pending or _renpi_client().error:
                textbutton "Reconnect / resend same request" action Function(_renpi_action, _renpi_client().reconnect) sensitive not _renpi_client().busy
            elif renpi_pending_adoption:
                if ((_renpi_client().state or {}).get("adoption") or {}).get("phase") == "rolled_back":
                    textbutton "Reload restored original runtime" action Function(_renpi_reload, source) sensitive not _renpi_client().busy
                elif _renpi_client().can_confirm(renpi_pending_adoption) and not _renpi_client().busy:
                    textbutton "Confirm reloaded entry" action Function(_renpi_action, _renpi_client().loaded, renpy.has_label, renpi_pending_adoption)
                elif _renpi_client().adoption:
                    textbutton "Reload current candidate" action Function(_renpi_reload) sensitive not _renpi_client().busy
                elif not _renpi_client().adoption and not _renpi_client().busy:
                    textbutton "Enter confirmed branch" action Return(("confirmed", None))
                textbutton "Recover prior runtime (report load failure)" action Return(("recover", None)) sensitive not _renpi_client().busy
            elif _renpi_client().adoption:
                textbutton "Reload published candidate" action Function(_renpi_reload) sensitive not _renpi_client().busy
            elif target:
                if "read" in available and renpy.has_label(target.get("entry_label", "")):
                    textbutton "Read existing branch" action Return(("enter", target)) sensitive not _renpi_client().busy
                if "adopt" in available:
                    textbutton "Adopt candidate" action Function(_renpi_action, _renpi_client().send, {"type": "adopt", "branch_id": target["id"], "candidate_id": target["candidate_id"]}) sensitive not _renpi_client().busy
                if "continue" in available:
                    textbutton "Continue original branch" action Function(_renpi_action, _renpi_client().send, {"type": "continue", "branch_id": target["id"]}) sensitive not _renpi_client().busy
                if "cancel" in available:
                    textbutton "Cancel production" action Function(_renpi_action, _renpi_client().send, {"type": "cancel", "branch_id": target["id"]}) sensitive not _renpi_client().busy
                textbutton "Return to source choices" action Return(("source", None)) sensitive not _renpi_client().busy
            else:
                for option_id, option_text in choices:
                    textbutton option_text action Function(_renpi_action, _renpi_client().choose, option_id, option_text) sensitive (not _renpi_client().busy and _renpi_client().synced == _renpi_client().position)
                    textbutton ("Retry as a NEW branch: " + option_text) action Function(_renpi_action, _renpi_client().choose, option_id, option_text, True) sensitive (not _renpi_client().busy and _renpi_client().synced == _renpi_client().position)
            textbutton "Leave this choice" action Return(("leave", None)) sensitive (not _renpi_client().busy and not _renpi_client().pending and not _renpi_client().adoption and not renpi_pending_adoption)

label renpi_choice(anchor, choices, _renpi_source=None, _renpi_entry=None, _renpi_branch=None, _renpi_ok=False):
    $ choices = renpi_bridge.options(choices)
    $ renpi_branch_id = renpi_branch_id or _renpi_client().base_branch
    $ renpi_anchor_id = anchor
    $ _renpi_source = (renpi_branch_id, renpi_anchor_id)
    while True:
        call screen renpi_bridge_choice(anchor, choices, _renpi_source)
        if _return[0] == "leave":
            return
        elif _return[0] == "source":
            $ renpi_branch_id, renpi_anchor_id = _renpi_source
            $ _renpi_client().target = None
            $ _renpi_client().synced = None
        elif _return[0] == "recover":
            $ _renpi_client().reject_load()
        elif _return[0] == "confirmed":
            $ _renpi_entry = renpi_pending_adoption["entry_label"]
            $ _renpi_branch = renpi_pending_adoption["branch_id"]
            $ _renpi_ok = _renpi_client().state.get("branches", {}).get(_renpi_branch, {}).get("published") and renpy.has_label(_renpi_entry)
            if _renpi_ok:
                $ renpi_branch_id, renpi_anchor_id = _renpi_branch, _renpi_entry
                $ renpi_pending_adoption = None
                call expression _renpi_entry
                $ renpi_branch_id, renpi_anchor_id = _renpi_source
                $ _renpi_client().target = None
            else:
                $ _renpi_client().error = "Candidate load was not confirmed. Return to the original branch after recovery."
                $ renpi_pending_adoption = None
        elif _return[0] == "enter":
            $ _renpi_entry = _return[1]["entry_label"]
            $ renpi_branch_id, renpi_anchor_id = _return[1]["id"], _renpi_entry
            call expression _renpi_entry
            $ renpi_branch_id, renpi_anchor_id = _renpi_source
            $ _renpi_client().target = None


