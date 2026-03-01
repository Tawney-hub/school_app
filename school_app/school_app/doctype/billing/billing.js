frappe.ui.form.on('Billing', {

    onload: function(frm) {
        frm.trigger('inject_total_css');
    },

    refresh: function(frm) {
        frm.trigger('inject_total_css');
        update_total(frm);
    },

    inject_total_css: function(frm) {
        // Move total_amount field to sit opposite the Items section heading
        setTimeout(function() {
            let $section = frm.fields_dict['items_section'] && frm.fields_dict['items_section'].$wrapper;
            let $total   = frm.fields_dict['total_amount'] && frm.fields_dict['total_amount'].$wrapper;
            if ($section && $total) {
                let $heading = $section.find('.section-head');
                $heading.css({'display':'flex','justify-content':'space-between','align-items':'center'});
                let $tag = $('<div class="total-tag" style="font-size:13px;font-weight:600;color:#2490ef;background:#e8f4ff;padding:4px 12px;border-radius:12px;"></div>');
                $heading.append($tag);
                // update tag text whenever total changes
                frm._update_total_tag = function() {
                    let val = frm.doc.total_amount || 0;
                    $tag.text('Total: ' + format_currency(val, frappe.boot.sysdefaults.currency));
                };
                frm._update_total_tag();
            }
        }, 300);
    },

    student_class: function(frm) { frm.trigger('fetch_student_count'); },
    section:       function(frm) { frm.trigger('fetch_student_count'); },

    fetch_student_count: function(frm) {
        if (!frm.doc.student_class) return;
        let filters = { student_class: frm.doc.student_class, status: 'Active' };
        if (frm.doc.section) filters['section'] = frm.doc.section;
        frappe.call({
            method: 'frappe.client.get_count',
            args: { doctype: 'Student', filters: filters },
            callback: function(r) {
                if (r.message !== undefined) frm.set_value('number_of_students', r.message);
            }
        });
    },

    fees_structure: function(frm) {
        if (!frm.doc.fees_structure) return;
        frappe.call({
            method: 'frappe.client.get',
            args: { doctype: 'Fee Structure', name: frm.doc.fees_structure },
            callback: function(r) {
                if (!r.message || !r.message.items) return;
                frm.clear_table('items');
                r.message.items.forEach(function(item) {
                    let row = frm.add_child('items');
                    row.item_code      = item.item_code;
                    row.item_name      = item.item_name;
                    row.pricelist_name = item.pricelist_name;
                    row.rate           = item.rate;
                    row.qty            = 1;
                    row.amount         = flt(item.rate) * 1;
                });
                frm.refresh_field('items');
                update_total(frm);
                frappe.show_alert({ message: 'Items loaded from Fee Structure', indicator: 'green' });
            }
        });
    }
});

frappe.ui.form.on('Billing Item', {
    rate:         function(frm, cdt, cdn) { calc_row_amount(frm, cdt, cdn); },
    qty:          function(frm, cdt, cdn) { calc_row_amount(frm, cdt, cdn); },
    amount:       function(frm)           { update_total(frm); },
    items_remove: function(frm)           { update_total(frm); }
});

function calc_row_amount(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    frappe.model.set_value(cdt, cdn, 'amount', flt(row.rate) * flt(row.qty));
}

function update_total(frm) {
    let total = 0;
    (frm.doc.items || []).forEach(function(row) { total += flt(row.amount); });
    frm.set_value('total_amount', total);
    frm.refresh_field('total_amount');
    if (frm._update_total_tag) frm._update_total_tag();
}
