(function($, exports) {
  if (typeof exports.Dexter == 'undefined') exports.Dexter = {};
  var Dexter = exports.Dexter;

  // basic document view
  Dexter.DocumentView = function() {
    var self = this;

    self.placesSetup = false;

    self.init = function() {
      $('a[href="#places-tab"][data-toggle="tab"]').on('shown.bs.tab', self.onPlacesTabShown);

      var $text = $('.document-container .article-content');
      if ($text.length > 0) {
        $text.affix({
          offset: {
            top: $text.offset().top - 100,
          }
        });
      }

      $('.fixed-header')
        .affix({
          offset: {
            top: 55,
          }
        });

      // attachment viewer
      $('.attachment-list')
        .on('click', '.show-text', self.showArticleText)
        .on('click', '.attachment', self.showAttachment);

      return self;
    };

    self.showArticleText = function(e) {
      e.preventDefault();
      $('.article-content .article-text').show();
      $('.attachment-viewer').hide();
    }

    self.showAttachment = function(e) {
      e.preventDefault();
      var $attachment = $(this);

      $('.article-content .article-text').hide();
      $('.attachment-viewer').show();

      var map = self.getAttachmentMap();

      // remove existing layers
      map.eachLayer(function(l) { map.removeLayer(l); });

      var size = $attachment.data('size').split(',');
      var w = size[0],
          h = size[1];

      var southWest = map.unproject([0, h], map.getMaxZoom()-1);
      var northEast = map.unproject([w, 0], map.getMaxZoom()-1);
      var bounds = new L.LatLngBounds(southWest, northEast);

      map.setMaxBounds(bounds);
      map.setView([0, 0], map.getMaxZoom()-1);
      L.imageOverlay($attachment.data('url'), bounds).addTo(map);
    };

    self.getAttachmentMap = function() {
      if (!self.attachmentMap) {
        self.attachmentMap = L.map('attachment-slippy', {
          minZoom: 1,
          maxZoom: 4,
          zoom: 1,
          center: [0, 0],
          crs: L.CRS.Simple,
          attributionControl: false,
        });
      }

      return self.attachmentMap;
    };

    self.onPlacesTabShown = function(e) {
      // invalidate the map so that it gets resized correctly
      $($(this).attr('href') + ' .leaflet-container').each(function(i, map) {
        Dexter.maps.invalidate();
      });

      if (!self.placesSetup) {
        Dexter.maps.loadAndDrawPlaces();
        self.placesSetup = true;
      }
    };
  };

  // view when editing document details (NOT the analysis)
  Dexter.EditDocumentView = function() {
    var self = this;

    self.init = function() {
      if ($('#new-document, #edit-document').length === 0) {
        return;
      }

      $('button.submit').on('click', function(e) {
        $('#edit-document form').submit();
      });

      // author name autocomplete
      self.$authorName = $('#author-name');
      self.$authorWidget = $('.author-widget');

      self.authorHound = new Bloodhound({
        name: 'authors',
        remote: {
          url: '/api/authors?q=%QUERY',
          ajax: {
            beforeSend: function(xhr) {
              self.$authorName.addClass('spinner');
            }
          },
          filter: function(resp) {
            self.$authorName.removeClass('spinner');
            return resp.authors;
          },
        },
        sorter: function(a, b) {
          // compare on length, then alphabetically
          if (a.name.length == b.name.length) {
            return a.name.localeCompare(b.name);
          } else {
            return a.name.length - b.name.length;
          }
        },
        datumTokenizer: function(d) { return Bloodhound.tokenizers.whitespace(d.name); },
        queryTokenizer: Bloodhound.tokenizers.whitespace
      });
      self.authorHound.initialize();

      var autoset = false;

      self.$authorName.typeahead({
        minLength: 2,
        highlight: true,
        autoselect: true,
      }, {
        source: self.authorHound.ttAdapter(),
        displayKey: 'name',
      }).on('typeahead:selected', function(e, author, dataset) {
        autoset = true;
        self.setAuthor(author);
      }).on('typeahead:opened', function(e) {
        autoset = false;
      }).on('typeahead:closed', function(e) {
        if (!autoset) {
          // auto-select an exact match if we haven't already
          self.authorHound.get(self.$authorName.typeahead('val'), function(suggestions) {
            var needle = self.$authorName.typeahead('val').toLowerCase();

            for (var i = 0; i < suggestions.length; i++) {
              if (suggestions[i].name.toLowerCase() == needle) {
                // TODO: handle an exact match (eg. try 'sapa')
                self.$authorName.typeahead('val', suggestions[i].name);
                self.$authorName.typeahead('close');
                self.$authorName.trigger('typeahead:selected', [suggestions[i], null]);
                return;
              }
            }

            // new author
            self.setNewAuthor();
          });
        }
      });

      // dropzone for article attachments
      var dropzone = new Dropzone("#dropzone", {
          url: '/articles/attachments',
          maxFilesize: 6,
          acceptedFiles: 'image/png,image/jpeg,image/gif,application/pdf',
          addRemoveLinks: true,
          headers: {"X-CSRF-Token": $('meta[name=csrf-token]').attr('content')},
        });
      dropzone
        .on('success', function(file) {
          // successfully uploaded
          dropzone.removeFile(file);

          var attachment = $.parseJSON(file.xhr.response).attachment;
          var li = $('.attachment-list .template')
            .clone()
            .removeClass('template')
            .appendTo($('.attachment-list'));

          $('<input type="hidden" name="attachments">')
            .val(attachment.id)
            .appendTo(li);

          $('a.download', li)
            .attr('href', attachment.download_url);

          $('img', li)
            .attr('src', attachment.thumbnail_url)
            .data('url', attachment.url)
            .data('size', attachment.size)
            .click();
        });

      // show the first attachment, if any
      $('.attachment-list .attachment').first().click();
    };

    self.setAuthor = function(author) {
      var info = [author.author_type];
      
      if (author.gender) info.push(author.gender);
      if (author.race) info.push(author.race);

      $('.author-details', self.$authorWidget).removeClass('hidden').text(info.join(', '));
      $('.new-author-details', self.$authorWidget).addClass('hidden');
    };

    self.setNewAuthor = function() {
      // TODO: show the new author form widgets,
      // include type of author, race, gender
      $('.author-details', self.$authorWidget).addClass('hidden');
      $('.new-author-details', self.$authorWidget).removeClass('hidden');
    };
  };

  // view when editing the document analysis
  Dexter.EditDocumentAnalysisView = function() {
    var self = this;

    self.init = function() {
      self.$form = $('form.edit-analysis');
      if (self.$form.length === 0) {
        return;
      }

      $('button.submit').on('click', function(e) {
        self.$form.submit();
      });

      // flag functionality
      $('label.article-flag input[type=checkbox]').on('change', function(e) {
        var checked = $(this).prop("checked");

        $('.article-flag i.fa').toggleClass('flag-set', checked);
        self.$form.find('[name="notes"]')
          .removeClass('hidden')
          .toggle(checked);
      });

      self.$form
        .on('ajax:success', function(e, data, status, xhr) {
          // success, reload the page
          $('input[data-disable-with]', self.$form).removeAttr('data-disable-with');
          document.location = document.location;
        })
        .on('ajax:error', function(e, xhr, status, error) {
          console.log(xhr.status);
          if (xhr.status == 500) {
            $('#error-box')
              .text('Hmm, something went wrong, please try again. (' + xhr.status + ': ' + error + ')')
              .show();
            $('html, body').animate({
              scrollTop: 0,
            }, 300);
          } else {
            // problem, do a non-ajax submit
            $('input[data-disable-with]', self.$form).removeAttr('data-disable-with');
            self.$form.removeData('remote').removeAttr('data-remote').submit();
          }
        });

      // source person name autocomplete
      self.personHound = new Bloodhound({
        name: 'people',
        remote: {
          url: '/api/people?q=%QUERY',
          ajax: {beforeSend: function(xrh) { self.ttShowSpinner(); }},
          filter: function(resp) { self.ttHideSpinner(); return resp.people; },
        },
        sorter: function(a, b) {
          // compare on length, then alphabetically
          if (a.name.length == b.name.length) {
            return a.name.localeCompare(b.name);
          } else {
            return a.name.length - b.name.length;
          }
        },
        datumTokenizer: function(d) { return Bloodhound.tokenizers.whitespace(d.name); },
        queryTokenizer: Bloodhound.tokenizers.whitespace
      });
      self.personHound.initialize();

      self.newSourceCount = $('.sources tr.new', self.$form).length;

      $('.btn.add-source').on('click', self.addSource);
      $('table.sources', self.$form).
        on('click', '.btn.delete', self.deleteSource).
        on('click', '.btn.undo-delete', self.undoDeleteSource).
        on('change', 'input:radio[name$="-source_type"]', self.toggleSourceType).
        on('change', 'input:checkbox[name$="-named"]', self.toggleAnonymous);

      self.newFairnessCount = $('.fairness tr.new', self.$form).length;
      $('table.fairness', self.$form).
        on('change', '.template select', self.addNewFairness).
        on('click', '.btn.delete', self.deleteFairness).
        on('click', '.btn.undo-delete', self.undoDeleteFairness);
    };
      
    self.addSource = function(e) {
      e.preventDefault();

      var $template = $('table.sources tr.template');
      var $row = $template.clone().insertBefore($template);

      // this row is no longer a template
      $row.removeClass('template').addClass('new');

      self.newSourceCount++;
      self.personTypeaheadEnabled = false;

      // change form field name and 'for' prefixes to be new[ix]
      $('input, select, textarea, label', $row).each(function() {
        var attrs = ['name', 'id', 'for'];

        for (var i = 0; i < attrs.length; i++) {
          var attr = attrs[i];
          var val = $(this).attr(attr);
          if (val) {
            $(this).attr(attr, val.replace('new-', 'new[' + self.newSourceCount + ']-'));
          }
        }
      });

      $('.select2', $row).select2();
      $('[title]', $row).tooltip();

      // trigger the source type toggle
      $('input:radio[name$="-source_type"]', $row)
        .first()
        .prop('checked', true)
        .trigger('change');
    };

    self.enablePersonTypeahead = function($row) {
      if (!self.personTypeaheadEnabled) {
        $('.name input', $row)
          .val('')
          .typeahead({
            minLength: 3,
            highlight: true,
            autoselect: true,
          }, {
            source: self.personHound.ttAdapter(),
            displayKey: 'name',
          })
          .on('typeahead:selected', self.personSourceChosen)
          .on('keydown', function(e) { self.activeTT = this });

        self.personTypeaheadEnabled = true;
      }
    };

    self.disablePersonTypeahead = function($row) {
      $('.name input', $row).typeahead('destroy').val('');
      self.personTypeaheadEnabled = false;
    };

    // a new person was chosen as a source from the typeahead box
    self.personSourceChosen = function(event, person, datasource) {
      var $row = $(this).closest('tr');
      var $select = $('select[name$="affiliation_id"]', $row);

      // find the matching affiliation option
      var affiliationId = $('option', $select).
        filter(function(i, opt) { return opt.innerText == person.affiliation; }).
        first().
        attr('value') || '';

      // choose the affiliation
      $select
        .val(affiliationId)
        .trigger('change');

      // choose the gender and race
      $.each(['race', 'gender'], function(i, attrib) {
        if (person[attrib]) {
          $('.' + attrib + ' input', $row).each(function(i, el) {
            var $el = $(el);
            var $label = $el.closest('label');

            if ($label.data('original-title') === person[attrib]) {
              $el.prop('checked', true);
              $label.addClass('active');
            } else {
              $el.prop('checked', false);
              $label.removeClass('active');
            }
          });
        }
      });

      // clear the source function
      $('select[name$="source_function_id"]', $row).val('');
    };

    // delete button was clicked
    self.deleteSource = function(e) {
      e.preventDefault();

      var $row = $(this).closest('tr');
      if ($row.hasClass('new')) {
        // it's new
        $row.remove();
      } else {
        // it's not new
        $row.addClass('deleted');
        $('input[name$="-deleted"]', $row).val('1');
      }
    };

    // undo a source delete
    self.undoDeleteSource = function(e) {
      e.preventDefault();

      var $row = $(this).closest('tr');
      $row.removeClass('deleted');
      $('input[name$="-deleted"]', $row).val('0');
    };

    // the source type has changed, update what fields are visible
    self.toggleSourceType = function(e) {
      var $row = $(this).closest('tr');
      var sourceType = $(this).val();

      $row
        .removeClass('source-child source-person source-secondary')
        .addClass('source-' + sourceType);

      if (sourceType == 'person') {
        self.enablePersonTypeahead($row);
      }

      if (sourceType == 'child') {
        self.disablePersonTypeahead($row);
      }

      if (sourceType == 'secondary') {
        $('input[name$="-named"]', $row).prop('checked', true).trigger('change');
        self.disablePersonTypeahead($row);
      }

      $('.name input', $row).focus();
    };

    self.toggleAnonymous = function(e) {
      var $row = $(this).closest('tr');
      $('.name', $row).toggle($(this).prop('checked'));
    };

    // when the user starts adding a new fairness, duplicate the row to keep a fresh
    // 'new entry' row, and then rename the elements on this one
    self.addNewFairness = function(e) {
      if ($(this).val() === '') return;

      var $row = $(this).closest('tr');
      var $template = $row.clone().insertAfter($row);
      $('select[type="text"]', $template).val('');

      // this row is no longer a template
      $row.removeClass('template').addClass('new');

      self.newFairnessCount++;

      // change form field name prefixes to be new[ix]
      $('select', $row).each(function() {
        $(this).attr('name', $(this).attr('name').replace('new-', 'new[' + self.newFairnessCount + ']-'));
      });

      // remove the (none) option
      $('select[name$="fairness_id"] > option', $row).each(function(i, opt) {
        if (opt.value === '') {
          $(opt).remove();
        }
      });

      $('.select2', $row).select2();
    };

    // delete button was clicked
    self.deleteFairness = function(e) {
      e.preventDefault();

      var $row = $(this).closest('tr');
      if ($row.hasClass('new')) {
        // it's new
        $row.remove();
      } else {
        // it's not new
        $row.addClass('deleted');
        $('select', $row).prop('disabled', true);
        $('input[name$="-deleted"]', $row).val('1');
      }
    };

    // undo a fairness delete
    self.undoDeleteFairness = function(e) {
      e.preventDefault();

      var $row = $(this).closest('tr');
      $row.removeClass('deleted');
      $('select', $row).prop('disabled', false);
      $('input[name$="-deleted"]', $row).val('0');
    };

    self.ttShowSpinner = function() {
      $(self.activeTT).addClass('spinner');
    };

    self.ttHideSpinner = function() {
      $(self.activeTT).removeClass('spinner');
    };
  };
})(jQuery, window);

$(function() {
  Dexter.documentView = new Dexter.DocumentView().init();
  new Dexter.EditDocumentView().init();
  new Dexter.EditDocumentAnalysisView().init();
});
Dropzone.autoDiscover = false;
