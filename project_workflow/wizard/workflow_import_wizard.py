# -*- coding: utf-8 -*-
# Copyright 2017 Modoolar <info@modoolar.com>
# License LGPLv3.0 or later (https://www.gnu.org/licenses/lgpl-3.0.en.html).

import logging
import base64
import cStringIO
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class WorkflowImportWizard(models.TransientModel):
    _name = 'project.workflow.import.wizard'

    data = fields.Binary(
        string='Data',
        required=True,
    )

    @api.multi
    def button_import(self):
        self.ensure_one()

        reader = self.get_xml_reader()
        importer = self.get_workflow_importer()
        stream = cStringIO.StringIO(base64.b64decode(self.data))
        importer.run(reader, stream)
        stream.close()

        return {
            'type': 'ir.actions.act_multi',
            'actions': [
                {'type': 'ir.actions.act_window_close'},
                {'type': 'ir.actions.act_view_reload'},
            ]
        }

    def get_xml_reader(self):
        return self.env['project.workflow.xml.reader']

    def get_workflow_importer(self):
        return self.env['project.workflow.importer']
