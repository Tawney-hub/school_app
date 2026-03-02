frappe.ui.form.on('Receipting', {

    onload: function(frm) {
        if (frm.doc.__islocal) {
            frm.trigger('fetch_default_account');
        }
        frm.trigger('setup_student_search');
    },

    refresh: function(frm) {
        frm.trigger('set_account_query');
        frm.trigger('setup_student_search');
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button('Auto Distribute', function() {
                frm.trigger('auto_distribute');
            }).addClass('btn-primary');
        }
    },

    setup_student_search: function(frm) {
        let field = frm.fields_dict['student_full_name'];
        if (!field || !field.$input) return;

        let $input = field.$input;
        $input.off('keyup.student_search focus.student_search blur.student_search');
        $('#student-dropdown-list').remove();

        $input.on('keyup.student_search focus.student_search', function() {
            let txt = $input.val() || '';

            frappe.call({
                method: 'school_app.school_app.doctype.receipting.receipting.search_students',
                args: {
                    doctype: 'Student',
                    txt: txt,
                    searchfield: 'name',
                    start: 0,
                    page_len: 20,
                    filters: {
                        student_class: frm.doc.student_class || '',
                        section: frm.doc.section || ''
                    }
                },
                callback: function(r) {
                    $('#student-dropdown-list').remove();
                    if (!r.message || !r.message.length) return;

                    // Use getBoundingClientRect for accurate position
                    let rect = $input[0].getBoundingClientRect();

                    let $list = $('<ul id="student-dropdown-list"></ul>').css({
                        position:     'fixed',
                        top:          rect.bottom + 2,
                        left:         rect.left,
                        width:        rect.width,
                        background:   '#fff',
                        border:       '1px solid #d1d8dd',
                        borderRadius: '4px',
                        zIndex:       99999,
                        listStyle:    'none',
                        padding:      '4px 0',
                        margin:       0,
                        maxHeight:    '220px',
                        overflowY:    'auto',
                        boxShadow:    '0 6px 16px rgba(0,0,0,0.12)'
                    });

                    r.message.forEach(function(s) {
                        let reg       = s[0];
                        let full_name = (s[1] || '').trim().replace(/\s+/g, ' ');
                        let display   = reg + ' - ' + full_name;

                        $('<li></li>').text(display).css({
                            padding:      '8px 14px',
                            cursor:       'pointer',
                            fontSize:     '13px',
                            color:        '#333',
                            borderBottom: '1px solid #f5f5f5'
                        }).hover(
                            function() { $(this).css('background', '#f0f4f8'); },
                            function() { $(this).css('background', '#fff'); }
                        ).mousedown(function(e) {
                            e.preventDefault();
                            frm.set_value('student_name', reg);
                            $input.val(display);
                            frm.doc.student_full_name = display;
                            $('#student-dropdown-list').remove();
                            frm.trigger('load_student_invoices');
                        }).appendTo($list);
                    });

                    $('body').append($list);
                }
            });
        });

        $input.on('blur.student_search', function() {
            setTimeout(function() {
                $('#student-dropdown-list').remove();
            }, 200);
        });
    },

    load_student_invoices: function(frm) {
        if (!frm.doc.student_name) return;
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: [
                    ['custom_student', '=', frm.doc.student_name],
                    ['docstatus', '=', 1],
                    ['outstanding_amount', '>', 0]
                ],
                fields: ['name', 'grand_total', 'outstanding_amount', 'fees_structure'],
                order_by: 'posting_date asc'
            },
            callback: function(r) {
                frm.clear_table('invoices');
                if (r.message && r.message.length) {
                    r.message.forEach(function(inv) {
                        let row            = frm.add_child('invoices');
                        row.invoice_number = inv.name;
                        row.fees_structure = inv.fees_structure;
                        row.total          = inv.grand_total;
                        row.outstanding    = inv.outstanding_amount;
                        row.allocated      = 0;
                    });
                    frm.refresh_field('invoices');
                    frappe.show_alert({ message: r.message.length + ' invoice(s) loaded', indicator: 'green' });
                    if (frm.doc.total_paid && frm.doc.total_paid > 0) {
                        frm.trigger('auto_distribute');
                    }
                } else {
                    frappe.show_alert({ message: 'No outstanding invoices for this student', indicator: 'orange' });
                }
            }
        });
    },

    payment_mode: function(frm) {
        frm.set_value('bank_cash_account', '');
        frm.trigger('fetch_default_account');
        frm.trigger('set_account_query');
    },

    set_account_query: function(frm) {
        frm.set_query('bank_cash_account', function() {
            let account_types = (frm.doc.payment_mode === 'Cash') ? ['Cash'] : ['Bank'];
            return {
                filters: [
                    ['Account', 'account_type', 'in', account_types],
                    ['Account', 'is_group', '=', 0],
                    ['Account', 'company', '=', frappe.defaults.get_default('company')]
                ]
            };
        });
    },

    fetch_default_account: function(frm) {
        let account_type = (frm.doc.payment_mode === 'Cash') ? 'Cash' : 'Bank';
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Account',
                filters: [
                    ['account_type', '=', account_type],
                    ['is_group', '=', 0],
                    ['company', '=', frappe.defaults.get_default('company')]
                ],
                fields: ['name'],
                limit: 1
            },
            callback: function(r) {
                if (r.message && r.message.length) {
                    frm.set_value('bank_cash_account', r.message[0].name);
                }
            }
        });
    },

    auto_distribute: function(frm) {
        if (!frm.doc.total_paid || frm.doc.total_paid <= 0) {
            frappe.msgprint("Please enter Total Paid amount first.");
            return;
        }
        let remaining = flt(frm.doc.total_paid);
        (frm.doc.invoices || []).forEach(function(row) {
            let allocate = 0;
            if (remaining > 0) {
                allocate  = Math.min(remaining, flt(row.outstanding));
                remaining = flt(remaining - allocate);
            }
            frappe.model.set_value(row.doctype, row.name, 'allocated', allocate);
        });
        frm.refresh_field('invoices');
        frappe.show_alert({
            message: remaining > 0
                ? `Unallocated: ${format_currency(remaining, frappe.boot.sysdefaults.currency)}`
                : 'Fully distributed across invoices',
            indicator: remaining > 0 ? 'orange' : 'green'
        });
    },

    total_paid: function(frm) {
        frm.trigger('auto_distribute');
    },

    student_class: function(frm) {
        frm.set_value('student_name', '');
        frm.set_value('student_full_name', '');
        frm.clear_table('invoices');
        frm.refresh_field('invoices');
        setTimeout(function() { frm.trigger('setup_student_search'); }, 300);
    },

    section: function(frm) {
        frm.set_value('student_name', '');
        frm.set_value('student_full_name', '');
        frm.clear_table('invoices');
        frm.refresh_field('invoices');
        setTimeout(function() { frm.trigger('setup_student_search'); }, 300);
    }
});

frappe.ui.form.on('Receipting Invoice', {
    allocated: function(frm) {
        let total_allocated = 0;
        (frm.doc.invoices || []).forEach(function(row) {
            total_allocated += flt(row.allocated);
        });
        let total_paid = flt(frm.doc.total_paid);
        if (total_paid > 0 && Math.round(total_allocated * 100) !== Math.round(total_paid * 100)) {
            frappe.show_alert({
                message: `Allocated: ${format_currency(total_allocated)} | Paid: ${format_currency(total_paid)} | Diff: ${format_currency(total_paid - total_allocated)}`,
                indicator: total_allocated > total_paid ? 'red' : 'orange'
            });
        }
    },

    invoice_number: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.invoice_number) return;
        frappe.call({
            method: 'frappe.client.get',
            args: { doctype: 'Sales Invoice', name: row.invoice_number },
            callback: function(r) {
                if (!r.message) return;
                frappe.model.set_value(cdt, cdn, 'fees_structure', r.message.fees_structure);
                frappe.model.set_value(cdt, cdn, 'total',          r.message.grand_total);
                frappe.model.set_value(cdt, cdn, 'outstanding',    r.message.outstanding_amount);
                frappe.model.set_value(cdt, cdn, 'allocated',      0);
            }
        });
    }
});
