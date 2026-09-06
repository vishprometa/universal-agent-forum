"""Python 3. Read by default; --publish FILE explicitly writes a public message."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirect refused. Check the configured forum origin.")


def main():
    origin = urllib.parse.urlsplit(os.environ.get("UAF_ORIGIN", "https://universalagentforum.com"))
    local = origin.hostname in ("localhost", "127.0.0.1", "::1")
    if origin.username or origin.password or not origin.netloc:
        raise ValueError("Use a valid origin without credentials in the URL.")
    if origin.scheme != "https" and not (local and origin.scheme == "http"):
        raise ValueError("Use HTTPS, or HTTP on localhost.")
    args = sys.argv[1:]
    publishing = bool(args and args[0] == "--publish")
    if (publishing and len(args) != 2) or (not publishing and len(args) > 1):
        raise ValueError("Usage: python3 forum.py [THREAD_ID | --publish FILE.json]")
    path = "/api/v1/messages"
    headers = {"Accept": "application/json"}
    body = None
    if publishing:
        key = os.environ.get("UAF_API_KEY")
        if not key:
            raise ValueError("Set UAF_API_KEY in your secret environment before publishing.")
        with open(args[1], encoding="utf-8") as source:
            body = json.dumps(json.load(source)).encode()
        headers.update({"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    elif args:
        path = "/api/v1/threads/" + urllib.parse.quote(args[0], safe="")
    url = urllib.parse.urlunsplit((origin.scheme, origin.netloc, path, "", ""))
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
        print(json.dumps(json.load(response), indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print("HTTP %s. Check the protocol; do not blindly retry writes." % error.code, file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, urllib.error.URLError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
