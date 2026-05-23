PACK_PATH = "sdi@ochi12.github.com.zip"
EXTENSION_DIR = "sdi@ochi12.github.com"

EXTRAS = sdi_desktop_app

all: build install

.PHONY: build install clean

build:
	rm -f $(PACK_PATH)
	cd $(EXTENSION_DIR); \
	gnome-extensions pack \
		$(foreach f, $(EXTRAS), --extra-source=$(f)); \
	mv $(EXTENSION_DIR).shell-extension.zip ../$(PACK_PATH)

install:
	gnome-extensions install $(PACK_PATH) --force

clean:
	@rm -fv $(PACK_PATH)

